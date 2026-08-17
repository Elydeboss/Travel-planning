//! Itinerary vault implementation: read/write/scan a tenant KV map.

#[derive(serde::Deserialize)]
pub struct SaveItineraryReq {
    /// Caller-chosen itinerary id (opaque, not PII).
    pub r#ref: String,
    /// JSON-serialised trip plan object.
    pub plan: serde_json::Value,
}

#[derive(serde::Serialize)]
pub struct SaveItineraryResp {
    pub saved: bool,
    pub r#ref: String,
}

#[derive(serde::Deserialize)]
pub struct GetItineraryReq {
    pub r#ref: String,
}

#[derive(serde::Serialize)]
pub struct GetItineraryResp {
    pub r#ref: String,
    pub plan: Option<serde_json::Value>,
}

#[derive(serde::Serialize)]
pub struct ListItinerariesResp {
    pub refs: alloc::vec::Vec<alloc::string::String>,
}

const ITINERARIES_MAP: &str = "itineraries";

/// Entry point called from `lib.rs`. `input` is the raw JSON bytes from the
/// node's `generic-input.input` field.
pub fn save_itinerary(input: &[u8]) -> Result<Vec<u8>, String> {
    let req: SaveItineraryReq =
        serde_json::from_slice(input).map_err(|e| alloc::format!("save-itinerary: bad input: {e}"))?;
    if req.r#ref.is_empty() {
        return Err("save-itinerary: ref must not be empty".to_string());
    }

    #[cfg(target_arch = "wasm32")]
    {
        let value = serde_json::to_vec(&req.plan).map_err(|e| e.to_string())?;
        put(&req.r#ref, &value)?;
        let _ = logging::info(&alloc::format!("itinerary saved: {}", req.r#ref));
        let resp = SaveItineraryResp { saved: true, r#ref: req.r#ref };
        serde_json::to_vec(&resp).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = req;
        Err("save_itinerary is only implemented on the wasm32 target".to_string())
    }
}

/// Entry point called from `lib.rs`. `input` is the raw JSON bytes from the
/// node's `generic-input.input` field.
pub fn get_itinerary(input: &[u8]) -> Result<Vec<u8>, String> {
    let req: GetItineraryReq =
        serde_json::from_slice(input).map_err(|e| alloc::format!("get-itinerary: bad input: {e}"))?;

    #[cfg(target_arch = "wasm32")]
    {
        let bytes = get(&req.r#ref)?;
        let plan = bytes.map(|b| serde_json::from_slice(&b).unwrap_or(serde_json::Value::Null));
        let resp = GetItineraryResp { r#ref: req.r#ref, plan };
        serde_json::to_vec(&resp).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = req;
        Err("get_itinerary is only implemented on the wasm32 target".to_string())
    }
}

/// Entry point called from `lib.rs`. `input` is the raw JSON bytes from the
/// node's `generic-input.input` field.
pub fn list_itineraries(input: &[u8]) -> Result<Vec<u8>, String> {
    #[cfg(target_arch = "wasm32")]
    {
        let _ = input;
        let refs = scan()?;
        let resp = ListItinerariesResp { refs };
        serde_json::to_vec(&resp).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = input;
        Err("list_itineraries is only implemented on the wasm32 target".to_string())
    }
}

#[cfg(target_arch = "wasm32")]
use crate::host::{
    interfaces::{kv_store, logging},
    tenant::tenant_context,
};

/// Full `z:<tid>:itineraries` map name for this tenant.
#[cfg(target_arch = "wasm32")]
fn map_name() -> alloc::string::String {
    let tid = tenant_context::tenant_did();
    alloc::format!("z:{}:{}", hex::encode(&tid), ITINERARIES_MAP)
}

#[cfg(target_arch = "wasm32")]
fn put(key: &str, value: &[u8]) -> Result<(), alloc::string::String> {
    kv_store::put(&map_name(), key.as_bytes(), value).map_err(|e| alloc::format!("kv put: {e}"))
}

#[cfg(target_arch = "wasm32")]
fn get(key: &str) -> Result<Option<alloc::vec::Vec<u8>>, alloc::string::String> {
    kv_store::get(&map_name(), key.as_bytes()).map_err(|e| alloc::format!("kv get: {e}"))
}

#[cfg(target_arch = "wasm32")]
fn scan() -> Result<alloc::vec::Vec<alloc::string::String>, alloc::string::String> {
    let rows = kv_store::scan(&map_name(), &[], &[0xff; 32], 100)
        .map_err(|e| alloc::format!("kv scan: {e}"))?;
    Ok(rows
        .into_iter()
        .map(|(k, _)| alloc::string::String::from_utf8_lossy(&k).into_owned())
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_rejects_empty_ref() {
        let input = serde_json::to_vec(&serde_json::json!({
            "ref": "",
            "plan": { "route": "LHR-JFK" },
        }))
        .unwrap();
        let result = save_itinerary(&input);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("ref must not be empty"));
    }

    #[test]
    fn save_rejects_bad_input() {
        let result = save_itinerary(b"not json");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("bad input"));
    }

    #[test]
    fn get_rejects_bad_input() {
        let result = get_itinerary(b"not json");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("bad input"));
    }

    #[test]
    fn non_wasm_returns_err() {
        let input = serde_json::to_vec(&serde_json::json!({ "ref": "abc", "plan": {} })).unwrap();
        assert!(save_itinerary(&input).unwrap_err().contains("wasm32"));
        assert!(get_itinerary(b"{\"ref\":\"abc\"}").unwrap_err().contains("wasm32"));
        assert!(list_itineraries(b"{}").unwrap_err().contains("wasm32"));
    }
}