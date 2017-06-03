# nfc-fun

This repository contains preliminary code that might become a ACR122U library based on their 2.03 API ([here](http://downloads.acs.com.hk/drivers/en/API-ACR122U-2.03.pdf)). Refer to that document for information on usage.

The library is largely promise based although the "outer shell" is callback oriented.

As it stands, the code is in JavaScript ES2015 and uses the NPM package [`pcsclite`](https://www.npmjs.com/package/pcsclite) to initiate communications with the reader.

Presently, I don't know the difference between "transmit" and "control", so... Some advice would be welcome.

## Getting Started

It's not quite a NPM package yet, but this is how working with it looks:

```javascript
const ACR122U = require('./acr122u');
const { numberToHexDigit, computeCheckDigit, hexToBuffer } = ACR122U;

ACR122U.prepareReader({
	debugMode: true,
	onConnect: function onConnect({ pcsc, reader, status, info, protocol, transmit, control, exit }) {
		console.log(`[${reader.name}] Reader:`, reader);
		console.log(`[${reader.name}] Status Info:`, info);

		Promise.resolve()
			.then(transmit({ name: 'Get UID', command: ACR122U.Commands.getUID }))
				// naming things doesn't do anything, but commands do get
				// labelled neatly in debug mode
			.then(ACR122U.ResponseTools.getResponse)
			.then(uid => console.log('UID:', uid));
	},
	onConnectError: function onConnectError({ error, details, exit }) {
		exit();
	},
	onCardRemoved: function onDisconnect({ pcsc, reader, status, info, exit }) {
		exit();
	},
	onCardRemovedError: function onDisconnectError({ error, details, exit }) {
		exit();
	},
	onEnd: function onEnd({ pcsc, reader, endContext }) {
		console.log('Goodbye!');
	},
});
```

## Commands: `ACR122U.Commands`

The following is based on the ACR122U API ([v2.03](http://downloads.acs.com.hk/drivers/en/API-ACR122U-2.03.pdf)).

This little fella contains the following commands:

 - `getUID`: (4.1 in API)
 - `getFirmwareVersion`: (6.3 in API)
 - `getPICCOperatingParameter`: (6.4 in API)

... and functions for generating commands:

 - `loadAuthenticationKeys(keyNumber, key)`: (5.1 in API)
 - `authenticate(blockNumber, keyType, keyNumber)`: (5.2 in API)
 - `readBinaryBlock(block, numBytes = 16)`: (5.3 in API)
 - `writeBinaryBlock(block, buffer)`: (5.4 in API)
 - `valueBlockOperation(blockNumber, vbOp, vbValue)`: (5.5.1 in API)
 - `valueBlockRead(blockNumber)`: (5.5.2 in API)
 - `valueBlockRestore(srcblockNumber, targetblockNumber)`: (5.5.3 in API)
 - `directTransmit(payload)`: (6.1 in API)
 - `ledAndBuzzerControl(ledStateControl, t1Duration, t2Duration, numRepetitions, buzzerLink)`: (6.2 in API)
 - `setPICCOperatingParameter(piccOperatingParameter)`: (6.5 in API)
 - `setTimeoutParameter(timeoutParameter)`: (6.6 in API)
 - `setBuzzerActivityOnDetection(buzzerOn)`: (6.7 in API)

## Utilities

Tools for Working with Responses: `ACR122U.ResponseTools`

 - `getResponseCode(responseBuffer)`: returns an object like `{ type: 'success', meaning: 'The operations completed successfully.', code: hexToBuffer('90 00') }` interpreting the response status
 - `getResponse(responseBuffer)`: returns only the response (without the status code) if successful otherwise returns `undefined`

Other tools:

 - `ACR122U.promiseTools.wait(t)`: Generates something that can be put in a promise chain and generates a wait of `t` milliseconds and passes the output of the preceding resolved Promise onwards when it is done (e.g.: `makeSomePromise().then(ACR122U.promiseTools.wait(1000)).then(doSomethingAfterDelay)`)
 - `ACR122U.hexToBuffer(hexstring)`: converts a hex string into a buffer (e.g.: `"FF CA 00 00 00"`)
 - `ACR122U.numberToHexDigit(n)`: converts a number into a hex digit for 1 byte (accepts integers from 0 to 255)
 - `ACR122U.computeCheckDigit(buffer, init = 0x00)`: computes a check digit by XOR-ing each element of a buffer with an initial seed byte (default: `0x00`, but one might want to change it as when computing the "first check digit" of a MIFARE UID)

## Constants: `ACR122U.Constants`

The following constants are for use with the various commands. Do consult the ACR122U API ([v2.03](http://downloads.acs.com.hk/drivers/en/API-ACR122U-2.03.pdf)) as needed.

 - `KEY_TYPE_A`: See `loadAuthenticationKeys` (5.1 in API)
 - `KEY_TYPE_B`: See `loadAuthenticationKeys` (5.1 in API)
 - `VALUE_BLOCK_OPERATION__STORE`: See `valueBlockOperation` (5.5.1 in API)
 - `VALUE_BLOCK_OPERATION__INCREMENT`: See `valueBlockOperation` (5.5.1 in API)
 - `VALUE_BLOCK_OPERATION__DECREMENT`: See `valueBlockOperation` (5.5.1 in API)
 - `LED_STATE__FINAL_RED`: See `ledAndBuzzerControl` (6.2 in API)
 - `LED_STATE__FINAL_GREEN`: See `ledAndBuzzerControl` (6.2 in API)
 - `LED_STATE__RED_STATE_MASK`: See `ledAndBuzzerControl` (6.2 in API)
 - `LED_STATE__GREEN_STATE_MASK`: See `ledAndBuzzerControl` (6.2 in API)
 - `LED_STATE__INITIAL_RED_BLINKING_STATE`: See `ledAndBuzzerControl` (6.2 in API)
 - `LED_STATE__INITIAL_GREEN_BLINKING_STATE`: See `ledAndBuzzerControl` (6.2 in API)
 - `LED_STATE__RED_BLINKING_MASK`: See `ledAndBuzzerControl` (6.2 in API)
 - `LED_STATE__GREEN_BLINKING_MASK`: See `ledAndBuzzerControl` (6.2 in API)
 - `BUZZER_OFF`: See `ledAndBuzzerControl` (6.2 in API)
 - `BUZZER_IN_T1`: See `ledAndBuzzerControl` (6.2 in API)
 - `BUZZER_IN_T2`: See `ledAndBuzzerControl` (6.2 in API)
 - `BUZZER_ON`: See `ledAndBuzzerControl` (6.2 in API)
 - `PICC_OPERATING_PARAMETER__DEFAULT`: See `setPICCOperatingParameter` (6.5 in API)
 - `PICC_OPERATING_PARAMETER__AUTO_PICC_POLLING`: See `setPICCOperatingParameter` (6.5 in API)
 - `PICC_OPERATING_PARAMETER__AUTO_ATS_GENERATION`: See `setPICCOperatingParameter` (6.5 in API)
 - `PICC_OPERATING_PARAMETER__SHORTER_POLLING_INTERVAL`: See `setPICCOperatingParameter` (6.5 in API)
 - `PICC_OPERATING_PARAMETER__POLLING_INTERVAL`: See `setPICCOperatingParameter` (6.5 in API)
 - `PICC_OPERATING_PARAMETER__DETECT_FELICA_424K`: See `setPICCOperatingParameter` (6.5 in API)
 - `PICC_OPERATING_PARAMETER__DETECT_FELICA_212K`: See `setPICCOperatingParameter` (6.5 in API)
 - `PICC_OPERATING_PARAMETER__DETECT_TOPAZ`: See `setPICCOperatingParameter` (6.5 in API)
 - `PICC_OPERATING_PARAMETER__DETECT_ISO14443B`: See `setPICCOperatingParameter` (6.5 in API)
 - `PICC_OPERATING_PARAMETER__DETECT_ISO14443A`: See `setPICCOperatingParameter` (6.5 in API)
