export function matchCategory(
  name: string,
  cats: { id: string; name: string; nameEn: string | null }[]
) {
  const n = name.toLowerCase().trim()
  return (
    cats.find(c => c.name.toLowerCase() === n || c.nameEn?.toLowerCase() === n) ||
    cats.find(c => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase())) ||
    cats.find(c => c.nameEn && (c.nameEn.toLowerCase().includes(n) || n.includes(c.nameEn.toLowerCase())))
  )
}
