#!/bin/bash
#set -o xtrace
webpack
maybepersonal=
if [ "$HOSTNAME" = "fenris" ]; then
  maybepersonal="--profile personal"
fi
aws s3 $maybepersonal cp --recursive --acl public-read dist s3://cloudhacking.net/boids2
