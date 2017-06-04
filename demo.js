const ACR122U = require('./acr122u');
const { numberToHexDigit, computeCheckDigit, hexToBuffer } = ACR122U;

const knownTagUIDs = {
	'tagRed-aka-EXIT': hexToBuffer('87 48 a7 01'),
	tagBlue: hexToBuffer('d3 e3 a5 01'),
	tagGreen: hexToBuffer('42 9a a3 01'),
	tagGrey: hexToBuffer('4c 40 a7 01'),
	tagYellow: hexToBuffer('7e f4 a7 01'),
	konbiniKey: hexToBuffer('cb 78 8a 1a'),
	wreckedNTAG216Card: hexToBuffer('04 4b 77 52 1e 4e 81'),
};

let seenFamiliarCard = false;

const checkForTagMatch = buffer => {
	const uidBuffer = ACR122U.ResponseTools.getResponse(buffer);
	console.log('UID:', uidBuffer);
	for (var name in knownTagUIDs) {
		if (knownTagUIDs[name].equals(uidBuffer)) {
			console.log();
			console.log(`UID match for ${name}`);
			console.log();
			seenFamiliarCard = true;
			if (name === 'tagRed-aka-EXIT') {
				console.log('We are done here.')
				throw new Error('tag-based-exit');
			}
		}
	}
	return uidBuffer;
};

let seenFirstCard = false;

const debugMode = true;
ACR122U.prepareReader({
	debugMode: debugMode,
	onConnect: function onConnect({ pcsc, reader, status, info, protocol, transmit, control, exit }) {

		if (!debugMode) {
			console.log(`[${reader.name}] Reader:`, reader);
			console.log(`[${reader.name}] Status Info:`, info);
			console.log(`[${reader.name}] Protocol:`, protocol);
		}

		seenFirstCard = true;

		function writeToBlockAndRead(block, delay = 0) {
			const data = hexToBuffer(`${numberToHexDigit(block * 4)} ${numberToHexDigit(block * 4)} ${numberToHexDigit(block * 4)} ${numberToHexDigit(Math.floor(255 * Math.random()))}`);
			return () => Promise.resolve()
				.then(() => console.log(`Writing to location ${(block * 4).toString(16)} (block ${block}):`, data))
				.then(transmit({ name: `Write-${(block * 4).toString(16)}`, command: ACR122U.Commands.writeBinaryBlock(block, data) }))
				.then(ACR122U.ResponseTools.getResponseCode)
				.then(response => {
					if (response && response.type !== 'success') {
						throw response;
					}
				})
				.then(ACR122U.promiseTools.wait(delay))
				.then(transmit({ name: `Read-${(block * 4).toString(16)}`, command: ACR122U.Commands.readBinaryBlock(block, 4) }))
				.then(ACR122U.ResponseTools.getResponse)
				.then(response => console.log(`Reading from location ${(block * 4).toString(16)} (block ${block}):`, response, (response && data.equals(response)) ? '(Match)' : '(No Match)'))
				.catch(x => console.log(x.meaning));
		}

		function writeToBlock(block) {
			const data = hexToBuffer(`${numberToHexDigit(block * 4)} ${numberToHexDigit(block * 4)} ${numberToHexDigit(block * 4)} ${numberToHexDigit(Math.floor(255 * Math.random()))}`);
			return () => Promise.resolve()
				.then(() => console.log(`Writing to location ${(block * 4).toString(16)} (block ${block}):`, data))
				.then(transmit({ name: `Write-${(block * 4).toString(16)}`, command: ACR122U.Commands.writeBinaryBlock(block, data) }))
		}

		function readChunks(chunkStart, numChunks, chunkSize = 1) {
			return () => {
				let p = Promise.resolve();
				for (let i = chunkStart; i < chunkStart + numChunks; i++) {
					p = p
						.then(transmit({ name: `Read-${i * chunkSize}`, command: ACR122U.Commands.readBinaryBlock(i * chunkSize, 4 * chunkSize) }))
						.then(ACR122U.ResponseTools.getResponse)
						.then(response => {
							let row = (i * 4 * chunkSize).toString(16);
							while (row.length < 4) {
								row = '0' + row;
							}
							row = `0x${row}`;
							if (!!response) {
								console.log(`${row}:`, response)
							} else {
								console.log(`--- No More Data @ ${row} ---`)
							}
						});
				}
				return p;
			};
		}

		const writeDelay = 2000;

		let p = Promise.resolve();

		p = p
			.then(transmit({ name: 'Get UID', command: ACR122U.Commands.getUID }))
			.then(checkForTagMatch)
			.then(uidBuffer => {
				console.log();
				console.log('Check Digits for UID in MIFARE UltraLight');
				console.log(`BCC0: ${numberToHexDigit(computeCheckDigit(uidBuffer.slice(0, 3), 0x88))} @ 0x03 (Page 0, Byte 3)`);  // cascade tag = 88h
				console.log(`BCC1: ${numberToHexDigit(computeCheckDigit(uidBuffer.slice(3, 7)))} @ 0x08 (Page 2, Byte 0)`);
				console.log();
			})
			.then(readChunks(0, 4))
			.then(transmit({ name: 'Get Firmware Version', command: ACR122U.Commands.getFirmwareVersion }))
			.then(x => console.log('Firmware Version: ', x.toString()))
			.then(transmit({ name: 'Get PICC Operating Parameter', command: ACR122U.Commands.getPICCOperatingParameter }))
			.then(x => {
				const param = x[1];
				console.log(`PICC Operating Parameter: ${numberToHexDigit(param)}`);
				console.log(` - PICC_OPERATING_PARAMETER__AUTO_PICC_POLLING:        ${!!(param & ACR122U.Constants.PICC_OPERATING_PARAMETER__AUTO_PICC_POLLING)}`);
				console.log(` - PICC_OPERATING_PARAMETER__AUTO_ATS_GENERATION:      ${!!(param & ACR122U.Constants.PICC_OPERATING_PARAMETER__AUTO_ATS_GENERATION)}`);
				console.log(` - PICC_OPERATING_PARAMETER__SHORTER_POLLING_INTERVAL: ${!!(param & ACR122U.Constants.PICC_OPERATING_PARAMETER__SHORTER_POLLING_INTERVAL)}`);
				console.log(` - PICC_OPERATING_PARAMETER__POLLING_INTERVAL:         ${!!(param & ACR122U.Constants.PICC_OPERATING_PARAMETER__POLLING_INTERVAL)}`);
				console.log(` - PICC_OPERATING_PARAMETER__DETECT_FELICA_424K:       ${!!(param & ACR122U.Constants.PICC_OPERATING_PARAMETER__DETECT_FELICA_424K)}`);
				console.log(` - PICC_OPERATING_PARAMETER__DETECT_FELICA_212K:       ${!!(param & ACR122U.Constants.PICC_OPERATING_PARAMETER__DETECT_FELICA_212K)}`);
				console.log(` - PICC_OPERATING_PARAMETER__DETECT_TOPAZ:             ${!!(param & ACR122U.Constants.PICC_OPERATING_PARAMETER__DETECT_TOPAZ)}`);
				console.log(` - PICC_OPERATING_PARAMETER__DETECT_ISO14443B:         ${!!(param & ACR122U.Constants.PICC_OPERATING_PARAMETER__DETECT_ISO14443B)}`);
				console.log(` - PICC_OPERATING_PARAMETER__DETECT_ISO14443A:         ${!!(param & ACR122U.Constants.PICC_OPERATING_PARAMETER__DETECT_ISO14443A)}`);
			})
			.then(transmit({ name: 'Load Auth. Keys 0', command: ACR122U.Commands.loadAuthenticationKeys(0, hexToBuffer('01 02 03 04 05 06')) }))
			.then(transmit({ name: 'Load Auth. Keys 1', command: ACR122U.Commands.loadAuthenticationKeys(1, hexToBuffer('11 12 13 14 15 16')) }))
			// .then(transmit({ name: 'Random Pseudo APDU: FF FF FF FF', command: ACR122U.Commands.directTransmit(hexToBuffer(`FF FF FF FF`)) }))
			// .then(transmit({ name: 'Buzz Around (Redly)', command: ACR122U.Commands.ledAndBuzzerControl(0x44, 5, 5, 3, ACR122U.Constants.BUZZER_OFF) }))
			// .then(ACR122U.promiseTools.wait(2000))
			// .then(transmit({ name: 'Buzz Around (Greenly)', command: ACR122U.Commands.ledAndBuzzerControl(0x88, 5, 5, 3, ACR122U.Constants.BUZZER_OFF) }))
			// .then(ACR122U.promiseTools.wait(2000))
			// .then(transmit({ name: 'Buzz Around (Off)', command: ACR122U.Commands.ledAndBuzzerControl(0x00, 1, 1, 1, ACR122U.Constants.BUZZER_OFF) }))
			.then(transmit({ name: 'Turn Buzzer Off On Detection', command: ACR122U.Commands.setBuzzerActivityOnDetection(false) }))
			// .then(transmit({ name: 'Turn Buzzer On On Detection', command: ACR122U.Commands.setBuzzerActivityOnDetection(true) }))
			.then(transmit({ name: 'Get Interface Status', command: ACR122U.Commands.getInterfaceStatus }))
			.then(ACR122U.ResponseTools.getResponse)
			.then(ACR122U.ResponseTools.parseInterfaceStatus)
			.then(r => console.log('Interface Status:', r))
			.then(transmit({ name: 'Get Challenge', command: ACR122U.Commands.getChallenge }))
			// .then(transmit({ name: 'Antenna Power Off', command: ACR122U.Commands.antennaPowerOff }))
			// .then(transmit({ name: 'Antenna Power On', command: ACR122U.Commands.antennaPowerOn }))
			.then(ACR122U.promiseTools.wait(0));

		if (false) {
			// value block: set / read / restore
			const d = Math.floor(Math.random() * 128 + 16);
			const vbBuffers = [0, 1].map(c => (c * 16 + d)).map(n => hexToBuffer(`${numberToHexDigit(n)} ${numberToHexDigit(n)} ${numberToHexDigit(n)} ${numberToHexDigit(n)}`));
			p = p
				.then(readChunks(0x20, 2))
				.then(transmit({ name: 'Set 0x20 as VB', command: ACR122U.Commands.valueBlockOperation(0x20, ACR122U.Constants.VALUE_BLOCK_OPERATION__STORE, vbBuffers.shift()) }))
				.then(ACR122U.promiseTools.wait(writeDelay))
				.then(transmit({ name: 'Set 0x21 as VB', command: ACR122U.Commands.valueBlockOperation(0x21, ACR122U.Constants.VALUE_BLOCK_OPERATION__STORE, vbBuffers.shift()) }))
				.then(ACR122U.promiseTools.wait(writeDelay))
				.then(readChunks(0x20, 2))
				.then(transmit({ name: 'Increment VB 0x20', command: ACR122U.Commands.valueBlockOperation(0x20, ACR122U.Constants.VALUE_BLOCK_OPERATION__INCREMENT, hexToBuffer('01 02 03 04')) }))
				.then(ACR122U.promiseTools.wait(writeDelay))
				.then(transmit({ name: 'Increment VB 0x21', command: ACR122U.Commands.valueBlockOperation(0x21, ACR122U.Constants.VALUE_BLOCK_OPERATION__DECREMENT, hexToBuffer('01 02 03 04')) }))
				.then(ACR122U.promiseTools.wait(writeDelay))
				.then(readChunks(0x20, 2))
				.then(transmit({ name: 'Read 0x20 as VB', command: ACR122U.Commands.valueBlockRead(0x20) }))
				.then(transmit({ name: 'Read 0x21 as VB', command: ACR122U.Commands.valueBlockRead(0x21) }))
				.then(transmit({ name: 'Restore 0x20 onto 0x21', command: ACR122U.Commands.valueBlockRestore(0x20, 0x21) }))
				.then(ACR122U.promiseTools.wait(writeDelay))
				.then(readChunks(0x20, 2))
				.then(ACR122U.promiseTools.wait(0));				
		}

		if (false) {
			// const writeBlockStart = 16; const writeBlockEnd = 924;
			const writeBlockStart = 4; const writeBlockEnd = 32;
			for (var i = writeBlockStart; i < writeBlockEnd; i++) {
				p = p.then(writeToBlockAndRead(i, writeDelay));
			}
		}

		if (false) {
			// display first 32 pages (32 * 4 bytes)
			p = p
				.then(readChunks(0, 32));
		}

		p = p
			.catch(e => {
				if (e && e.message !== 'tag-based-exit') {
					console.error(e.stack);
				}
				exit();
			});
	},
	onConnectError: function onConnectError({ error, details, exit }) {
		exit();
	},
	onCardRemoved: function onDisconnect({ pcsc, reader, status, info, exit }) {
		if (!seenFirstCard) {
			console.log('Waiting for item...')
		} else {
			if (!seenFamiliarCard) {
				exit();
			}
		}
	},
	onCardRemovedError: function onDisconnectError({ error, details, exit }) {
		exit();
	},
	onEnd: function onEnd({ pcsc, reader, endContext }) {
		console.log('Goodbye!\n\n----------\n');
	},
});
