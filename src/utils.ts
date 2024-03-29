// Import types and APIs from graph-ts
import {
  Address,
  BigInt,
  ByteArray,
  Bytes,
  ethereum,
  log,
} from "@graphprotocol/graph-ts";
import { Account, Domain } from "./types/schema";

export function createEventID(event: ethereum.Event): string {
  return event.block.number
    .toString()
    .concat("-")
    .concat(event.logIndex.toString());
}

export const ETH_NODE =
  "93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae";
export const ROOT_NODE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
export const TKN_NODE =
  "0x93CDEB708B7545DC668EB9280176169D1C33CFD8ED6F04690A0BCC88A93FC4AE";
export const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";
export namespace constants {
  export const TKN_LABEL = Bytes.fromHexString(
    "DE0C1D6DBFBABD5AFF517A513D611C602B4DD4019C95AEB1094BBAA8BE785B71"
  );
}
export const TKN_DOMAIN = "0x3cDB9bC080Efe321A797E7286d302B90227cc6De";

// Helper for concatenating two byte arrays
export function concat(a: ByteArray, b: ByteArray): ByteArray {
  let out = new Uint8Array(a.length + b.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i];
  }
  for (let j = 0; j < b.length; j++) {
    out[a.length + j] = b[j];
  }
  // return out as ByteArray
  return changetype<ByteArray>(out);
}

export function byteArrayFromHex(s: string): ByteArray {
  if (s.length % 2 !== 0) {
    throw new TypeError("Hex string must have an even number of characters");
  }
  let out = new Uint8Array(s.length / 2);
  for (var i = 0; i < s.length; i += 2) {
    out[i / 2] = parseInt(s.substring(i, i + 2), 16) as u32;
  }
  return changetype<ByteArray>(out);
}

export function uint256ToByteArray(i: BigInt): ByteArray {
  let hex = i.toHex().slice(2).padStart(64, "0");
  return byteArrayFromHex(hex);
}

export function createOrLoadAccount(address: string): Account {
  let account = Account.load(address);
  if (account == null) {
    account = new Account(address);
    account.save();
  }

  return account;
}

export function createOrLoadDomain(
  node: string,
  timestamp: BigInt = BigInt.fromI32(0),
  owner: string = ""
): Domain {
  let domain = Domain.load(node);
  if (domain == null) {
    domain = new Domain(node);
    domain.subdomainCount = 0;
    domain.isMigrated = true;
    domain.owner = owner;
    domain.createdAt = timestamp;
    domain.save();
  }

  return domain;
}

export function checkValidLabel(name: string): boolean {
  for (let i = 0; i < name.length; i++) {
    let c = name.charCodeAt(i);
    if (c === 0) {
      log.warning("Invalid label '{}' contained null byte. Skipping.", [name]);
      return false;
    } else if (c === 46) {
      log.warning(
        "Invalid label '{}' contained separator char '.'. Skipping.",
        [name]
      );
      return false;
    }
  }

  return true;
}
