import type { RecordData } from "./finance";
export const INITIAL_OWNERS: RecordData[] = [
  {
    id: "owner-ram",
    name: "Ram",
    emails: ["ramasami.official@gmail.com"],
    kind: "owner",
    status: "Active",
    version: 1,
  },
  {
    id: "owner-varsha",
    name: "Varsha",
    emails: ["tnvarsha.99@gmail.com"],
    kind: "owner",
    status: "Active",
    version: 1,
  },
];
export function allOwners(settings: RecordData[]) {
  const rows = settings.filter((row) => row.kind === "owner");
  return rows.length ? rows : INITIAL_OWNERS;
}
export function activeOwners(settings: RecordData[]) {
  return allOwners(settings).filter((row) => row.status === "Active");
}
export function ownerEmails(owner: RecordData): string[] {
  return Array.isArray(owner.emails)
    ? owner.emails
        .map((email: string) => email.trim().toLowerCase())
        .filter(Boolean)
    : [];
}
export function accountOwners(
  account: RecordData,
  owners: RecordData[],
): string[] {
  if (Array.isArray(account.ownerIds)) return account.ownerIds;
  return owners
    .filter(
      (owner) =>
        account.person === "Combined" ||
        [owner.name, ...(owner.aliases || [])].includes(account.person),
    )
    .map((owner) => owner.id);
}
export function belongsToOwner(
  row: RecordData,
  person: string,
  accounts: RecordData[],
  owners: RecordData[],
): boolean {
  if (person === "Combined") return true;
  const owner = owners.find(
    (owner) => owner.name === person || owner.id === person,
  );
  if (!owner) return row.person === person;
  const linked = accounts.filter(
    (account) =>
      account.id === row.account ||
      account.id === row.toAccount ||
      account.name === row.account ||
      account.name === row.toAccount,
  );
  if (linked.length)
    return linked.some((account) =>
      accountOwners(account, owners).includes(owner.id),
    );
  return (
    row.person === "Combined" ||
    [owner.name, ...(owner.aliases || [])].includes(row.person)
  );
}
