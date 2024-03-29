// Import types and APIs from graph-ts
import { Address, BigInt, crypto, ens, log } from "@graphprotocol/graph-ts";

import {
  concat,
  constants,
  createEventID,
  EMPTY_ADDRESS,
  ROOT_NODE,
  TKN_DOMAIN,
  TKN_NODE,
} from "./utils";

// Import event types from the registry contract ABI
import {
  NewOwner as NewOwnerEvent,
  NewResolver as NewResolverEvent,
  NewTTL as NewTTLEvent,
  Transfer as TransferEvent,
} from "./types/ENSRegistry/EnsRegistry";

// Import entity types generated from the GraphQL schema
import {
  Account,
  Domain,
  NewOwner,
  NewResolver,
  NewTTL,
  Resolver,
  Transfer,
} from "./types/schema";

const BIG_INT_ZERO = BigInt.fromI32(0);

function createDomain(node: string, timestamp: BigInt): Domain {
  let domain = new Domain(node);
  if (node == ROOT_NODE || node == TKN_NODE) {
    domain = new Domain(node);
    domain.owner = EMPTY_ADDRESS;
    domain.isMigrated = true;
    domain.createdAt = timestamp;

    domain.subdomainCount = 0;
    log.error("domain.name = {}", ["new domain entity"]);
  }

  return domain;
}

function getDomain(
  node: string,
  timestamp: BigInt = BIG_INT_ZERO
): Domain | null {
  let domain = Domain.load(node);
  if (domain === null && (node == ROOT_NODE || node == TKN_NODE)) {
    return createDomain(node, timestamp);
  } else {
    return domain;
  }
}

function makeSubnode(event: NewOwnerEvent): string {
  return crypto
    .keccak256(concat(event.params.node, event.params.label))
    .toHexString();
}

function recurseDomainDelete(domain: Domain): string | null {
  if (
    (domain.resolver == null ||
      domain.resolver!.split("-")[0] === EMPTY_ADDRESS) &&
    domain.owner === EMPTY_ADDRESS &&
    domain.subdomainCount === 0
  )
    return null;

  {
    let domainParent = domain.parent;
    if (domainParent) {
      const parentDomain = Domain.load(domainParent);
      if (parentDomain) {
        parentDomain.subdomainCount = parentDomain.subdomainCount - 1;
        parentDomain.save();
        return recurseDomainDelete(parentDomain);
      } else {
        return null; //note: what happens if the Domain.load returns null, do we want to return domain.id or should we return null?
      }
    }
  }
  return domain.id;
}

function saveDomain(domain: Domain): void {
  recurseDomainDelete(domain);
  let domainName = domain.name;
  if (domainName) {
    if (domainName.includes(".tkn.eth") || domainName == "tkn.eth") {
      domain.save();
    }
  }
}

// Handler for NewOwner events
function _handleNewOwner(event: NewOwnerEvent, isMigrated: boolean): void {
  let account = new Account(event.params.owner.toHexString());
  account.save();

  let subnode = makeSubnode(event);
  let domain = getDomain(subnode, event.block.timestamp);
  let parent = getDomain(event.params.node.toHexString());

  if (domain === null) {
    domain = new Domain(subnode);
    domain.createdAt = event.block.timestamp;
    domain.subdomainCount = 0;
  }

  if (domain.parent === null && parent !== null) {
    parent.subdomainCount = parent.subdomainCount + 1;
    parent.save();
  }

  if (domain.name == null) {
    // Get label and node names
    let label = ens.nameByHash(event.params.label.toHexString());
    if (label != null) {
      domain.labelName = label;
    }

    let labelName = domain.labelName;
    if (labelName) log.error("LOG ERROR: domain.label= {}", [labelName]);

    if (label === null) {
      label = "[" + event.params.label.toHexString().slice(2) + "]";
    }
    if (
      event.params.node.toHexString() ==
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      domain.name = label;
    } else {
      parent = parent;
      if (parent) {
        let name = parent.name;
        if (label && name) {
          domain.name = label + "." + name;
        }
      }
    }

    domain.owner = event.params.owner.toHexString();
    domain.parent = event.params.node.toHexString();
    domain.labelhash = event.params.label;
    domain.isMigrated = isMigrated;
    saveDomain(domain);

    let domainName = domain.name;
    if (domainName)
      if (domainName.includes(".tkn.eth") || domainName == "tkn.eth") {
        let domainEvent = new NewOwner(createEventID(event));
        domainEvent.blockNumber = event.block.number.toI32();
        domainEvent.transactionID = event.transaction.hash;
        domainEvent.parentDomain = event.params.node.toHexString();
        domainEvent.domain = subnode;
        domainEvent.owner = event.params.owner.toHexString();
        domainEvent.save();
      }
  }
}

// Handler for Transfer events
export function handleTransfer(event: TransferEvent): void {
  let node = event.params.node.toHexString();

  let account = new Account(event.params.owner.toHexString());
  account.save();

  // Update the domain owner
  let domain = getDomain(node);
  if (domain) {
    domain.owner = event.params.owner.toHexString();
    saveDomain(domain);

    let domainEvent = new Transfer(createEventID(event));
    domainEvent.blockNumber = event.block.number.toI32();
    domainEvent.transactionID = event.transaction.hash;
    domainEvent.domain = node;
    domainEvent.owner = event.params.owner.toHexString();
    domainEvent.save();
  }
}

// Handler for NewResolver events
export function handleNewResolver(event: NewResolverEvent): void {
  let id: string | null;

  // if resolver is set to 0x0, set id to null
  // we don't want to create a resolver entity for 0x0
  if (event.params.resolver.toHexString() === EMPTY_ADDRESS) {
    id = null;
  } else {
    id = event.params.resolver
      .toHexString()
      .concat("-")
      .concat(event.params.node.toHexString());
  }

  let node = event.params.node.toHexString();
  let domain = getDomain(node);
  if (domain) {
    domain.resolver = id;

    if (id) {
      let resolver = Resolver.load(id);
      if (resolver == null) {
        resolver = new Resolver(id);
        resolver.domain = event.params.node.toHexString();
        resolver.address = event.params.resolver;
        resolver.save();
        // since this is a new resolver entity, there can't be a resolved address yet so set to null
        domain.resolvedAddress = null;
      } else {
        domain.resolvedAddress = resolver.addr;
      }
    } else {
      domain.resolvedAddress = null;
    }
    saveDomain(domain);
  }
  let domainEvent = new NewResolver(createEventID(event));
  domainEvent.blockNumber = event.block.number.toI32();
  domainEvent.transactionID = event.transaction.hash;
  domainEvent.domain = node;
  domainEvent.resolver = id ? id : EMPTY_ADDRESS;
  domainEvent.save();
}

// Handler for NewTTL events
export function handleNewTTL(event: NewTTLEvent): void {
  let node = event.params.node.toHexString();
  let domain = getDomain(node);
  // For the edge case that a domain's owner and resolver are set to empty
  // in the same transaction as setting TTL
  if (domain) {
    domain.ttl = event.params.ttl;
    saveDomain(domain);
  }

  let domainEvent = new NewTTL(createEventID(event));
  domainEvent.blockNumber = event.block.number.toI32();
  domainEvent.transactionID = event.transaction.hash;
  domainEvent.domain = node;
  domainEvent.ttl = event.params.ttl;
  domainEvent.save();
}

export function handleNewOwner(event: NewOwnerEvent): void {
  //if (event.params.label == constants.TKN_LABEL) {
  _handleNewOwner(event, true);
  //}
}

export function handleNewOwnerOldRegistry(event: NewOwnerEvent): void {
  let subnode = makeSubnode(event);
  let domain = getDomain(subnode);

  if (domain == null || domain.isMigrated == false) {
    _handleNewOwner(event, false);
  }
}

export function handleNewResolverOldRegistry(event: NewResolverEvent): void {
  let node = event.params.node.toHexString();
  let domain = getDomain(node, event.block.timestamp);
  if (domain)
    if (node == ROOT_NODE || !domain.isMigrated) {
      handleNewResolver(event);
    }
}
export function handleNewTTLOldRegistry(event: NewTTLEvent): void {
  let domain = getDomain(event.params.node.toHexString());
  if (domain)
    if (domain.isMigrated == false) {
      handleNewTTL(event);
    }
}

export function handleTransferOldRegistry(event: TransferEvent): void {
  let domain = getDomain(event.params.node.toHexString());
  if (domain)
    if (domain.isMigrated == false) {
      handleTransfer(event);
    }
}
