use std::{collections::HashMap, env, path::PathBuf};

use risc0_build::{embed_methods_with_options, DockerOptionsBuilder, GuestOptionsBuilder};
use risc0_build_ethereum::generate_solidity_files;

/// Path where the generated Solidity ImageID file will be written.
const SOLIDITY_IMAGE_ID_PATH: &str = "../contracts/src/ImageID.sol";
/// Path where the generated Solidity Elf file will be written (for tests).
const SOLIDITY_ELF_PATH: &str = "../contracts/test/Elf.sol";

fn main() {
    // Deterministic builds via Docker when RISC0_USE_DOCKER is set.
    println!("cargo:rerun-if-env-changed=RISC0_USE_DOCKER");
    println!("cargo:rerun-if-changed=build.rs");

    let manifest_dir = PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap());

    let mut builder = GuestOptionsBuilder::default();
    if env::var("RISC0_USE_DOCKER").is_ok() {
        let docker_options = DockerOptionsBuilder::default()
            .root_dir(manifest_dir.join(".."))
            .build()
            .unwrap();
        builder.use_docker(docker_options);
    }
    let guest_options = builder.build().unwrap();

    // Step 1: Compile the puzzle-solver guest → embed ELF + generate methods.rs
    let guests = embed_methods_with_options(HashMap::from([("puzzle-solver", guest_options)]));

    // Step 2: Generate Solidity files from the compiled guests
    let solidity_opts = risc0_build_ethereum::Options::default()
        .with_image_id_sol_path(SOLIDITY_IMAGE_ID_PATH)
        .with_elf_sol_path(SOLIDITY_ELF_PATH);

    if let Err(e) = generate_solidity_files(guests.as_slice(), &solidity_opts) {
        println!("cargo:warning=Failed to generate Solidity files: {e}");
    };
}
