import { Address, BigInt, store, Bytes, log } from '@graphprotocol/graph-ts'
import { ERC721, Transfer } from '../generated/templates/NftContract/ERC721'
import { ERC721Metadata } from '../generated/templates/NftContract/ERC721Metadata'
import { Nft, Ownership } from '../generated/schema'
import { BIGINT_ONE, BIGINT_ZERO, ZERO_ADDRESS } from './constants'

export function handleTransfer (event: Transfer): void {
  let address = event.address.toHexString()
  let nftId = address + '/' + event.params.tokenId.toString()
  let contract = ERC721Metadata.bind(event.address)
  let nft = Nft.load(nftId)
  if (nft == null) {
    nft = new Nft(nftId)
    nft.contract = address
    nft.tokenID = event.params.tokenId

    let metadataURI = contract.try_tokenURI(event.params.tokenId)
    if (!metadataURI.reverted) {
      nft.tokenURI = normalize(metadataURI.value)
    } else {
      nft.tokenURI = ''
    }
    nft.createdAt = event.block.timestamp
    nft.save()
  }

  if (event.params.to == ZERO_ADDRESS) {
    // burn token
    nft.removedAt = event.block.timestamp
    nft.save()
  }

  if (event.params.from != ZERO_ADDRESS) {
    updateOwnership(nftId, event.params.from, BIGINT_ZERO.minus(BIGINT_ONE))
  }
  updateOwnership(nftId, event.params.to, BIGINT_ONE)
}

export function fetchName (tokenAddress: Address): string {
  let contract = ERC721Metadata.bind(tokenAddress)
  let name = contract.try_name()
  if (!name.reverted) {
    return normalize(name.value)
  } else {
    return ''
  }
}

export function fetchSymbol (tokenAddress: Address): string {
  let contract = ERC721Metadata.bind(tokenAddress)
  let symbol = contract.try_symbol()
  if (!symbol.reverted) {
    return normalize(symbol.value)
  } else {
    return ''
  }
}

export function updateOwnership (
  nftId: string,
  owner: Address,
  deltaQuantity: BigInt
): void {
  let ownershipId = nftId + '/' + owner.toHexString()
  let ownership = Ownership.load(ownershipId)

  if (ownership == null) {
    ownership = new Ownership(ownershipId)
    ownership.nft = nftId
    ownership.owner = owner
    ownership.quantity = BIGINT_ZERO
  }

  let newQuantity = ownership.quantity.plus(deltaQuantity)

  if (newQuantity.lt(BIGINT_ZERO)) {
    log.error('Negative token quantity: ' + newQuantity.toString(), [])
    store.remove('Ownership', ownershipId)
  } else if (newQuantity.isZero()) {
    store.remove('Ownership', ownershipId)
  } else {
    ownership.quantity = newQuantity
    ownership.save()
  }
}

export function supportsInterfaceErc721 (
  contract: ERC721,
  interfaceId: String,
  expected: boolean = true
): boolean {
  let supports = contract.try_supportsInterface(toBytes(interfaceId))
  return !supports.reverted && supports.value == expected
}

export function normalize (strValue: string): string {
  if (strValue.length === 1 && strValue.charCodeAt(0) === 0) {
    return ''
  } else {
    for (let i = 0; i < strValue.length; i++) {
      if (strValue.charCodeAt(i) === 0) {
        strValue = setCharAt(strValue, i, '\ufffd') // graph-node db does not support string with '\u0000'
      }
    }
    return strValue
  }
}

export function setCharAt (str: string, index: i32, char: string): string {
  if (index > str.length - 1) return str
  return str.substr(0, index) + char + str.substr(index + 1)
}

export function toBytes (hexString: String): Bytes {
  let result = new Uint8Array(hexString.length / 2)
  for (let i = 0; i < hexString.length; i += 2) {
    result[i / 2] = parseInt(hexString.substr(i, 2), 16) as u32
  }
  return Bytes.fromUint8Array(result)
}
