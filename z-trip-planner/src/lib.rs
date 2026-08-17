//! z-trip-planner v0.1.0 — an original T3N tenant contract.
//!
//! A TEE-backed itinerary vault. The reference `z-tenant-flight` contract only
//! READS the `secrets` KV map; this contract WRITES, READS BACK, and SCANS its
//! own `itineraries` map via the `host:interfaces/kv-store` interface, so a
//! travel-concierge agent can persist and reload a traveler's trip plans.
//!
//! Privacy model: itinerary plans carry only opaque trip metadata (route,
//! dates, cabin). Passenger PII never enters the contract — a real booking
//! step would resolve `{{profile.*}}` markers host-side exactly like
//! `z-tenant-flight::book-offer`.
//!
//! Setup: before first use the tenant SDK must create the `itineraries` KV
//! map with this contract's `contract_id` on the readers/writers ACL, and
//! seed the map (see `../t3n-quickstart/use-case.ts`).
#![warn(clippy::style, missing_debug_implementations)]
#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

extern crate alloc;

pub const CONTRACT_VERSION: &str = "0.1.0";

wit_bindgen::generate!({
    world: "trip-planner",
    path: "wit",
    additional_derives: [
        serde::Deserialize,
        serde::Serialize,
    ],
    generate_all,
});

mod itinerary;

struct Component;

#[cfg(target_arch = "wasm32")]
impl exports::z::trip_planner::contracts::Guest for Component {
    fn save_itinerary(
        req: exports::z::trip_planner::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        let input = req.input.ok_or("save-itinerary: missing input")?;
        itinerary::save_itinerary(&input)
    }

    fn get_itinerary(
        req: exports::z::trip_planner::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        let input = req.input.ok_or("get-itinerary: missing input")?;
        itinerary::get_itinerary(&input)
    }

    fn list_itineraries(
        req: exports::z::trip_planner::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        let input = req.input.ok_or("list-itineraries: missing input")?;
        itinerary::list_itineraries(&input)
    }
}

#[cfg(target_arch = "wasm32")]
export!(Component);

#[cfg(test)]
mod tests {
    use super::CONTRACT_VERSION;

    #[test]
    fn contract_version_is_semver() {
        let parts: Vec<&str> = CONTRACT_VERSION.split('.').collect();
        assert_eq!(parts.len(), 3, "CONTRACT_VERSION must be MAJOR.MINOR.PATCH");
        for part in parts {
            assert!(part.parse::<u32>().is_ok(), "each part must be a number");
        }
    }

    #[test]
    fn contract_version_matches_cargo() {
        assert_eq!(CONTRACT_VERSION, "0.1.0");
    }
}