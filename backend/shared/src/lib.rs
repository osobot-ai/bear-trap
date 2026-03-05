pub mod db;

pub use db::{Db, Delegation, Puzzle};

use serde::{Deserialize, Serialize};

/// Caveat within a delegation — must match frontend DelegationCaveat interface.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DelegationCaveat {
    pub enforcer: String,
    pub terms: String,
    #[serde(default)]
    pub args: String,
}

/// Signed delegation data — must match frontend DelegationData interface.
/// Used for schema validation when storing delegation JSON via the admin CLI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DelegationData {
    pub delegate: String,
    pub delegator: String,
    pub authority: String,
    pub caveats: Vec<DelegationCaveat>,
    pub salt: serde_json::Value,
    pub signature: String,
}

/// Validate that a JSON string conforms to the expected delegation schema.
pub fn validate_delegation_json(json: &str) -> Result<DelegationData, String> {
    let data: DelegationData = serde_json::from_str(json)
        .map_err(|e| format!("Invalid delegation JSON schema: {e}. Required fields: delegate, delegator, authority, caveats, salt, signature"))?;

    // Validate that ZKPEnforcer caveats have terms long enough to include operatorAddress.
    // terms = abi.encode(bytes32 imageId, uint256 puzzleId, address operatorAddress)
    // = 32 + 32 + 32 = 96 bytes = 192 hex chars + "0x" prefix = 194 chars minimum
    for caveat in &data.caveats {
        let terms_clean = caveat.terms.strip_prefix("0x").unwrap_or(&caveat.terms);
        if terms_clean.len() < 192 {
            return Err(format!(
                "Caveat terms too short ({} hex chars, need >= 192).                  ZKPEnforcer terms must be abi.encode(bytes32 imageId, uint256 puzzleId, address operatorAddress)",
                terms_clean.len()
            ));
        }
    }

    Ok(data)
}
