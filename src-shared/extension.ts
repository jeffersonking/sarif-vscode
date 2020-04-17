export {}

// Causing colorization issues if placed above Array.prototype...
// Ideally: ((_) => number) | ((_) => string)
type Selector<T> = (_: T) => number | string

declare global {
	interface ArrayConstructor {
		commonLength(a: any[], b: any[]): number
	}
	interface Array<T> {
		last: T
		replace(items: T[]) // From Mobx, but not showing up.
		sortBy<T>(this: T[], selector: Selector<T>, descending?: boolean): Array<T> // Not a copy
	}
	interface String {
		file: String
		path: String
	}
}

Array.commonLength = function(a: any[], b: any[]): number {
	let i = 0
	for (; a[i] === b[i] && i < a.length && i < b.length; i++) {}
	return i
}

Object.defineProperty(Array.prototype, 'last', {
	get: function() {
		return this[this.length - 1]
	}
})

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

Object.defineProperty(String.prototype, 'file', {
	get: function() {
		return this.substring(this.lastIndexOf('/') + 1, this.length)
	}
})

Object.defineProperty(String.prototype, 'path', {
	get: function() {
		return this.substring(0, this.lastIndexOf('/'))
	}
})
