const path = require('path').join(__dirname, 'src-view-dev')

module.exports = {
	resolve: {
		extensions: ['.js', '.ts', '.tsx'] // .js is neccesary for transitive imports
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: [{
					loader: 'ts-loader',
					options: { transpileOnly: true } // 4x speed increase, but no type checks.
				}],
				exclude: /node_modules/
			},
			{
				test: /\.s?css$/,
				use:  ['style-loader', 'css-loader', 'sass-loader']
			},
			{
				test: /\.ttf$/,
				use: 'url-loader'
			},
		]
	},

	mode: 'production',
	entry: './src-view/Index.tsx',
	output: {
		path,
		filename: 'index.js',
	},

	devServer : {
		port: 8000,
		contentBase: path,
		stats: 'none',
	},

	stats: {
		all: false,
		assets: true,
		builtAt: true,
		timings: true,
	},
	performance: {
		hints: false,
		maxAssetSize: 310 * 1024,
		maxEntrypointSize: 310 * 1024,
	},
}
