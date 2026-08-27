// This simulated catalog is deliberately server-authoritative. The browser may
// select an identifier, but it never supplies the credits or price to be saved.
const packages = [
  { packageId: 'demo-10', packageName: '10 节课程包', creditQuantity: 10, amountCents: 50000 },
  { packageId: 'demo-20', packageName: '20 节课程包', creditQuantity: 20, amountCents: 92000 },
];

const byId = new Map(packages.map((entry) => [entry.packageId, Object.freeze(entry)]));

export function getPackage(packageId) {
  return byId.get(packageId) ?? null;
}

export function listPackages() {
  return packages.map((entry) => ({ ...entry }));
}
