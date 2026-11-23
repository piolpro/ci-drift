RUN apk add --update --no-cache git rsync docker $([ $(arch) == "aarch64" ] && echo "python3 make g++") && \
    yarn global add npm && \
    wget -q https://example.invalid/solc
