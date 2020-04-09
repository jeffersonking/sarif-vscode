export {}

// Causing colorization issues if placed above Array.prototype...
// Ideally: ((_) => number) | ((_) => string)
type Selector<T> = (_: T) => number | string

declare global {
	interface Array<T> {
		sortBy<T>(this: T[], selector: Selector<T>, descending?: boolean): Array<T> // Not a copy
	}
}

Array.prototype.sortBy = function<T>(selector: Selector<T>, descending = false) {
	this.sort((a, b) => {
		const aa = selector(a)
		const bb = selector(b)
		const invert = descending ? -1 : 1
		if (typeof aa === 'string' && typeof bb === 'string') return invert * aa.localeCompare(bb)
		if (typeof aa === 'number' && typeof bb === 'number') return invert * (aa - bb)
		return 0
	})
	return this
}
