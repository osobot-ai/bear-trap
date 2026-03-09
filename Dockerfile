FROM rust:1.93-slim AS builder
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/ ./backend/
COPY guests/ ./guests/
COPY Cargo.toml ./Cargo.toml
COPY rust-toolchain.toml ./rust-toolchain.toml
RUN cd backend && cargo build --release --bin bear-trap-api --bin bear-trap-admin

FROM debian:trixie-slim
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*

# Install r0vm — needed by risc0-zkvm's default_executor() for preflight execution.
# The Boundless SDK uses preflight to compute image_id, journal, and cycle count
# from the guest ELF before submitting proof requests.
# Version must match risc0-zkvm crate version (3.0.5).
RUN curl -L https://risczero.com/install | bash && \
    ~/.risc0/bin/rzup install r0vm 3.0.5 && \
    # Copy r0vm to a stable path so we can reference it via RISC0_SERVER_PATH
    find ~/.risc0 -name r0vm -type f -exec cp {} /usr/local/bin/r0vm \; && \
    chmod +x /usr/local/bin/r0vm && \
    # Clean up rzup to save image space
    rm -rf ~/.risc0
ENV RISC0_SERVER_PATH=/usr/local/bin/r0vm

COPY --from=builder /app/backend/target/release/bear-trap-api /usr/local/bin/
COPY --from=builder /app/backend/target/release/bear-trap-admin /usr/local/bin/
# Guest ELF must be pre-built before `docker build`.
# Build it with: cd guests/puzzle-solver && cargo build --release --target riscv32im-risc0-zkvm-elf
# Or use the risc0 toolchain: rzup && cargo risczero build --manifest-path guests/puzzle-solver/Cargo.toml
COPY guests/puzzle-solver/target/riscv32im-risc0-zkvm-elf/docker/puzzle-solver.bin /app/puzzle-solver.elf
RUN mkdir -p /data
ENV DATABASE_PATH=/data/puzzles.db
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:3001/health || exit 1
CMD ["bear-trap-api"]
