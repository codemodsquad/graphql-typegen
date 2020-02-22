export default function isValidIdentifier(name: string): boolean {
  return /^[_a-z][_a-z0-9]*$/i.test(name)
}
