# Tectonic + Node runtime. Build a small-ish image with the official Tectonic
# binary release. We use Debian slim so Tectonic's expected glibc/openssl are
# present and the resulting image still runs fine on Fargate, ECS, plain
# Docker, or as a Lambda container image (paired with aws-lambda-web-adapter).
FROM node:22-trixie-slim

ARG TECTONIC_VERSION=0.16.9
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl xz-utils libfontconfig1 libgraphite2-3 libharfbuzz0b libssl3 \
 && rm -rf /var/lib/apt/lists/*

# Pull the prebuilt Tectonic release. Tectonic fetches the rest of the TeXLive
# bundle from its CDN on first compile and caches it under XDG_CACHE_HOME.
RUN set -eux; \
    arch="$(uname -m)"; \
    case "$arch" in \
      x86_64)  url="https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic@${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-gnu.tar.gz" ;; \
      aarch64) url="https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic@${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-aarch64-unknown-linux-musl.tar.gz" ;; \
      *) echo "unsupported arch: $arch" && exit 1 ;; \
    esac; \
    curl -fsSL "$url" -o /tmp/tectonic.tar.gz; \
    tar -xzf /tmp/tectonic.tar.gz -C /usr/local/bin tectonic; \
    rm /tmp/tectonic.tar.gz; \
    tectonic --version

ENV XDG_CACHE_HOME=/var/cache/tectonic
RUN mkdir -p "$XDG_CACHE_HOME"

# Warm the Tectonic bundle so cold compiles don't pay the download cost.
# (Optional: skip if you'd rather keep the image lean.)
# printf '%s' avoids dash's backslash-escape interpretation, which would
# otherwise turn \b in \begin{document} into a literal backspace byte and
# trip TeX's "invalid character" check.
RUN printf '%s\n' '\documentclass{article}\begin{document}warmup\end{document}' > /tmp/warm.tex \
 && tectonic --outdir /tmp /tmp/warm.tex \
 && rm -f /tmp/warm.tex /tmp/warm.pdf /tmp/warm.log

WORKDIR /app
COPY package.json server.js ./

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
