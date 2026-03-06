FROM rust:1.93-slim AS builder
WORKDIR /app
COPY backend/ ./backend/
COPY guests/ ./guests/
COPY Cargo.toml ./Cargo.toml
COPY rust-toolchain.toml ./rust-toolchain.toml
RUN cd backend && cargo build --release --bin bear-trap-api --bin bear-trap-admin

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*
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
