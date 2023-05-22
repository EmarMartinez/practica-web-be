#!/bin/bash

(docker image rm $1 || echo "Image not found") &&
docker build -t $1 --build-arg TAG=gallium-alpine3.15 . &&
docker push $1
