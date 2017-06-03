#!/bin/bash

CURR_DIR="$(pwd)"

DEFAULT_DURATION=5

re='^[0-9]+$'
if (! [[ $1 =~ $re ]]) || [ $1 -lt 0 ] ; then
	echo "Using default duration: $DEFAULT_DURATION sec"
	DURATION=$DEFAULT_DURATION
else
	DURATION=$1
fi

while :
do
	echo " "
	echo "-----[START]-----"
	babel-node nfc-test.js
	echo "Pausing for $DURATION sec before next test press [CTRL+C] to stop..."
	echo "------[END]------"
	echo " "
	sleep $DURATION
done
