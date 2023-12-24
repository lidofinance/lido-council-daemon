export function formModuleAddressFilter(moduleAddresses: string[]) {
  return moduleAddresses
    .map((address) => `moduleAddress=${encodeURIComponent(address)}`)
    .join('&');
}
