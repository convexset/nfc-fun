const PCSCLite = require('pcsclite');
const ACR122U = {};

ACR122U.prepareReader = function prepareReader({
	onConnect = function onConnect({ pcsc, reader, status, info, protocol, transmit, exit }) {},
	onConnectError = function onConnectError({ error, details, exit }) {},
	onCardRemoved = function onDisconnect({ pcsc, reader, status, info, exit }) {},
	onCardRemovedError = function onDisconnectError({ error, details, exit }) {},
	onEnd = function onEnd({ pcsc, reader, endContext }) {},
	onPCSCError = function onPCSCError({ error, pcsc }) {},
	debugMode = false,
} = {}) {
	const pcsc = PCSCLite();

	pcsc.on('error', function(error) {
		onPCSCError({
			error: error,
			pcsc: pcsc,
		});
	});

	pcsc.on('reader', function(reader) {
		function exit() {
			if (debugMode) {
				console.log(`[${reader.name}] Exiting...`);
			}
			reader.close();
			pcsc.close();
		}

		reader.on('end', function() {
			if (debugMode) {
				console.log(`[${reader.name}] Interaction complete.`);
			}
			onEnd({
				pcsc: pcsc,
				reader: reader,
				endContext: this,
			});
		});

		reader.on('status', function(status) {
			const context = this;
			const details = {
				pcsc: pcsc,
				reader: reader,
				status: status,
				info: parseStatus(status)
			};

			if (debugMode) {
				console.log(`[${reader.name}] Reader:`, reader);
				console.log(`[${reader.name}] Status Info:`, details.info);
			}

			const changes = context.state ^ status.state;
			if (changes) {
				if ((changes & context.SCARD_STATE_EMPTY) && (status.state & context.SCARD_STATE_EMPTY)) {
					// card removed
					if (debugMode) {
						console.log(`[${reader.name}] Card Removed.`);
					}
					reader.disconnect(reader.SCARD_LEAVE_CARD, function(error) {
						if (error) {
							onCardRemovedError({
								error: error,
								details: details,
								exit: exit,
							});
						} else {
							details.exit = exit;
							onCardRemoved(details);
						}
					});

				} else if ((changes & context.SCARD_STATE_PRESENT) && (status.state & context.SCARD_STATE_PRESENT)) {
					// card inserted
					if (debugMode) {
						console.log(`[${reader.name}] Card Inserted.`);
					}
					connect(reader, { share_mode: context.SCARD_SHARE_SHARED })
						.then(protocol => {
							if (debugMode) {
								console.log(`[${reader.name}] Connection Made with protocol:`, protocol);
							}

							details.protocol = protocol;
							details.exit = exit;

							details.transmit = function transmit({ command, name = 'unnamed-operation', resLen = 255 } = {}) {
								return () => new Promise((resolve, reject) => {
									const id = Math.floor(Math.random() * 900000 + 100000);
									if (debugMode) {
										console.log(`[${reader.name}|transmit|${id}|${name}] Transmitting:`, command);
									}
									reader.transmit(command, resLen, protocol, function(err, data) {
										if (!!err) {
											if (debugMode) {
												console.log(`[${reader.name}|transmit|error|${id}|${name}] Error:`, err);
											}
											reject(err);
										} else {
											if (debugMode) {
												const responseCode = ACR122U.ResponseTools.getResponseCode(data);
												console.log(`[${reader.name}|transmit|${id}|${name}] Received:`, data);
												console.log(`[${reader.name}|transmit|${id}|${name}] Response Code:`, responseCode && responseCode.meaning || '-');
											}
											resolve(data);
										}
									});
								});
							};

							details.control = function control({ command, name = 'unnamed-operation', controlCode, resLen = 255 } = {}) {
								return () => new Promise((resolve, reject) => {
									const id = Math.floor(Math.random() * 900000 + 100000);
									if (debugMode) {
										console.log(`[${reader.name}|control|${id}|${name}] Transmitting:`, command);
									}
									reader.control(command, controlCode, resLen, function(err, data) {
										if (!!err) {
											if (debugMode) {
												console.log(`[${reader.name}|control|${id}] Error:`, err);
											}
											reject(err);
										} else {
											if (debugMode) {
												console.log(`[${reader.name}|control|${id}] Received:`, data);
											}
											resolve(data);
										}
									});
								});
							};

							onConnect(details);
						})
						.catch(error => {
							if (debugMode) {
								console.log(`Connection Error (Reader: ${reader.name}):`, error);
							}
							onConnectError({
								error: error,
								details: details,
								exit: exit,
							});
						});
				}
			}
		});
	});
};

function computeCheckDigit(buffer, init = 0x00) {
	let checkDigit = init;
	for (var idx = 0; idx < buffer.length; idx++) {
		checkDigit ^= buffer[idx];
	}
	return checkDigit;
}
ACR122U.computeCheckDigit = computeCheckDigit;

ACR122U.Cards = [
	{ name: 'MIFARE Classic 1K', identifier: hexToBuffer('00 01') },
	{ name: 'MIFARE Classic 4K', identifier: hexToBuffer('00 02') },
	{ name: 'MIFARE Ultralight', identifier: hexToBuffer('00 03') },
	{ name: 'MIFARE Mini', identifier: hexToBuffer('00 26') },
	{ name: 'Topaz and Jewel', identifier: hexToBuffer('F0 04') },
	{ name: 'FeliCa 212K', identifier: hexToBuffer('F0 11') },
	{ name: 'FeliCa 424K', identifier: hexToBuffer('F0 12') },
];

function getCardInformation(atr) {
	const cardBuffer = atr.slice(13, 13 + 2);
	for (let i = 0; i < ACR122U.Cards.length; i++) {
		const cardInfo = ACR122U.Cards[i];
		if (cardBuffer.equals(cardInfo.identifier)) {
			return cardInfo;
		}
	}
	return { identifier: cardBuffer };
}

function parseStatus(status) {
	// Example: { state: 34, atr: <Buffer 3b 8f 80 01 || 80 4f 0c | a0 00 00 03 06 | 03 | 00 01 | 00 00 00 00 || 6a> }
	const parsedStatus = { state: status.state };
	if (status.atr.length >= 2) {
		const nHB = status.atr[1] - 0x80;
		const hb = status.atr.slice(4, nHB);

		const checkDigit = status.atr[4 + nHB];
		const expectedCheckDigit = computeCheckDigit(status.atr.slice(1, 3 + nHB));

		if (hexToBuffer('80 4F').equals(status.atr.slice(4, 4 + 2))) {
			parsedStatus.type = 'ISO 14443 Part 3';
			parsedStatus.RID = status.atr.slice(7, 7 + 5);
			parsedStatus.SS = status.atr.slice(12, 12 + 1);
			const cardInformation = getCardInformation(status.atr);
			if (!!cardInformation) {
				parsedStatus.cardInformation = cardInformation;
			}
			parsedStatus.RFU = status.atr.slice(15, 15 + 4);
		} else {
			parsedStatus.type = 'Not Fully Parsed'; // 'ISO 14443 Part 4';
		}

		const problems = [];

		parsedStatus.atr = status.atr;
		if (status.atr[0] != 0x3B) {
			problems.push({
				issue: 'initial-header-not-correct',
			});
		}
		parsedStatus.atrNumHistoricalBytes = nHB;
		parsedStatus.historicalBytes = hb;
		if (checkDigit != expectedCheckDigit) {
			problems.push({
				issue: 'incorrect-check-digit',
				checkDigit: checkDigit,
				expectedCheckDigit: expectedCheckDigit,
			});
		}
		parsedStatus.T0 = status.atr[1];
		parsedStatus.TD1 = status.atr[2];
		parsedStatus.TD2 = status.atr[3];

		if (problems.length > 0) {
			parsedStatus.problems = problems;
		}
	}
	return parsedStatus;
}

function connect(reader, mode) {
	return new Promise((resolve, reject) => {
		const args = [function(error, result) {
			if (!!error) {
				reject(error);
			} else {
				resolve(result);
			}
		}];
		if (!!mode) {
			args.unshift(mode);
		}
		reader.connect(...args);
	});
}

function hexToBuffer(hexString) {
	return new Buffer(hexString.replace(/[^0-9a-fA-F]/g, '').toUpperCase(), 'hex');
}
function numberToHexDigit(n) {
	n = n % 256;
	return `${n < 16 ? '0' : ''}${n.toString(16)}`;
}
ACR122U.hexToBuffer = hexToBuffer;
ACR122U.numberToHexDigit = numberToHexDigit;

ACR122U.Commands = {
	getUID: hexToBuffer('FF CA 00 00 00'),
	loadAuthenticationKeys: (keyNumber, key) => Buffer.concat([hexToBuffer(`FF 82 00 ${numberToHexDigit(keyNumber % 2)} 06`), key.slice(0, 6)]),
	authenticate: (blockNumber, keyType, keyNumber) => hexToBuffer(`FF 86 00 00 05 01 00 ${numberToHexDigit(blockNumber)} ${numberToHexDigit(keyType)} ${numberToHexDigit(keyNumber % 2)}`),
	readBinaryBlock: (block, numBytes = 16) => hexToBuffer(`FF B0 00 ${numberToHexDigit(block)} ${numberToHexDigit(numBytes)}`),
	writeBinaryBlock: (block, buffer) => Buffer.concat([hexToBuffer(`FF D6 00 ${numberToHexDigit(block)} ${numberToHexDigit(buffer.length)}`), buffer]),
	valueBlockOperation: (blockNumber, vbOp, vbValue) => Buffer.concat([hexToBuffer(`FF D7 00 ${numberToHexDigit(blockNumber)} 05 ${numberToHexDigit(vbOp)}`), vbValue]),
	valueBlockRead: (blockNumber) => hexToBuffer(`FF B1 00 ${numberToHexDigit(blockNumber)} 04`),
	valueBlockRestore: (srcblockNumber, targetblockNumber) => hexToBuffer(`FF D7 00 ${numberToHexDigit(srcblockNumber)} 02 03 ${numberToHexDigit(targetblockNumber)}`),
	directTransmit: (payload) => Buffer.concat([hexToBuffer(`FF 00 00 00 ${numberToHexDigit(payload.length)}`), payload]),
	ledAndBuzzerControl: (ledStateControl, t1Duration, t2Duration, numRepetitions, buzzerLink) => hexToBuffer(`FF 00 40 ${numberToHexDigit(ledStateControl)} ${numberToHexDigit(t1Duration)} ${numberToHexDigit(t2Duration)} ${numberToHexDigit(numRepetitions)} ${numberToHexDigit(buzzerLink)}`),
	getFirmwareVersion: hexToBuffer('FF 00 48 00 00'),
	getPICCOperatingParameter: hexToBuffer('FF 00 50 00 00'),
	setPICCOperatingParameter: (piccOperatingParameter) => hexToBuffer(`FF 00 51 ${numberToHexDigit(piccOperatingParameter)} 00`),
	setTimeoutParameter: (timeoutParameter) => hexToBuffer(`FF 00 41 ${numberToHexDigit(timeoutParameter)} 00`),
	setBuzzerActivityOnDetection: (buzzerOn) => hexToBuffer(`FF 00 52 ${numberToHexDigit(!!buzzerOn ? 0xFF : 0x00)} 00`),
};

ACR122U.Constants = {
	KEY_TYPE_A: 0x60,
	KEY_TYPE_B: 0x60,
	VALUE_BLOCK_OPERATION__STORE: 0x00,
	VALUE_BLOCK_OPERATION__INCREMENT: 0x01,
	VALUE_BLOCK_OPERATION__DECREMENT: 0x02,
	LED_STATE__FINAL_RED: 0x01,
	LED_STATE__FINAL_GREEN: 0x02,
	LED_STATE__RED_STATE_MASK: 0x04,
	LED_STATE__GREEN_STATE_MASK: 0x08,
	LED_STATE__INITIAL_RED_BLINKING_STATE: 0x10,
	LED_STATE__INITIAL_GREEN_BLINKING_STATE: 0x20,
	LED_STATE__RED_BLINKING_MASK: 0x40,
	LED_STATE__GREEN_BLINKING_MASK: 0x80,
	BUZZER_OFF: 0x00,
	BUZZER_IN_T1: 0x01,
	BUZZER_IN_T2: 0x02,
	BUZZER_ON: 0x03,
	PICC_OPERATING_PARAMETER__DEFAULT: 0xFF,
	PICC_OPERATING_PARAMETER__AUTO_PICC_POLLING: 0x01,
	PICC_OPERATING_PARAMETER__AUTO_ATS_GENERATION: 0x02,
	PICC_OPERATING_PARAMETER__SHORTER_POLLING_INTERVAL: 0x04, // 1: 250ms; 0: 500ms
	PICC_OPERATING_PARAMETER__POLLING_INTERVAL: 0x04, // 1: 250ms; 0: 500ms
	PICC_OPERATING_PARAMETER__DETECT_FELICA_424K: 0x08,
	PICC_OPERATING_PARAMETER__DETECT_FELICA_212K: 0x10,
	PICC_OPERATING_PARAMETER__DETECT_TOPAZ: 0x20,
	PICC_OPERATING_PARAMETER__DETECT_ISO14443B: 0x40,
	PICC_OPERATING_PARAMETER__DETECT_ISO14443A: 0x80,
};

ACR122U.ResponseCodes = [
	{ type: 'success', meaning: 'The operations completed successfully.', code: hexToBuffer('90 00') },
	{ type: 'error', meaning: 'The operation failed.', code: hexToBuffer('63 00') },
	{ type: 'error', meaning: 'Function not supported.', code: hexToBuffer('6A 81') },
];

ACR122U.ResponseTools = Object.freeze({
	getResponseCode: function getResponseCode(buffer) {
		const code = buffer.slice(buffer.length - 2, buffer.length);
		for (let i = 0; i < ACR122U.ResponseCodes.length; i++) {
			const response = ACR122U.ResponseCodes[i];
			if (code.equals(response.code) || ((0x90 === code[0]) && (0x90 === response.code[0]))) {
				if (0x90 === code[0]) {
					return {
						type: response.type,
						meaning: response.meaning,
						code: code,
						subcode: code[1]
					}
				} else {
					return response;
				}
			}
		}
		return { code: code };
	},
	getResponse: function getResponse(buffer) {
		const responseCode = ACR122U.ResponseTools.getResponseCode(buffer);
		if (responseCode && responseCode.type === 'success') {
			return buffer.slice(0, buffer.length - 2);
		}
	},
});

ACR122U.promiseTools = {
	wait: function generateWait(t) {
		return v => new Promise(resolve => {
			setTimeout(() => { resolve(v); }, t);
		});
	},
};

module.exports = ACR122U;
