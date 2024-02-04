#!/bin/bash

if [ -d "/tmp/site-packages" ]; then
    echo "BDFR already copied to /tmp. Skipping"
    exit
else
    cp -r /opt/bdfr /tmp/site-packages
    echo "Copied /opt/bdfr to /tmp/site-packages."
fi