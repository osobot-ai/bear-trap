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

    // At least one caveat must have ZKPEnforcer-length terms (>= 192 hex chars = 96 bytes).
    // Other caveats (NativeTokenTransferAmount, ExactCalldata) have shorter or empty terms.
    let has_zkp_enforcer = data.caveats.iter().any(|c| {
        let terms_clean = c.terms.strip_prefix("0x").unwrap_or(&c.terms);
        terms_clean.len() >= 192
    });
    if !has_zkp_enforcer {
        return Err(
            "No caveat has ZKPEnforcer-length terms (>= 192 hex chars).              At least one caveat must encode (imageId, puzzleId, operatorAddress)."
                .to_string(),
        );
    }

    Ok(data)
}
