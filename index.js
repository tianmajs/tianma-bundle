'use strict';

var util = require('util');

var	PATTTEN_IMPORT_FORMAL = /@import\s+url\s*\(\s*(['"]?)([^'"]+?)\1\s*\);/g;
var	PATTTEN_IMPORT_SIMPLE = /@import\s+(['"])([^'"]+?)\1\s*;/g;

var TEMPLATE_AMD = [
	'define("%s", [ %s ], %s);'
].join('\n');

function parseJS(code) {
	var modules = [];
	
	new Function('define', code).call(null, function (id, deps, fn) {
		modules.push({
			id: id,
			dependencies: deps,
			code: util.format(TEMPLATE_AMD, id, deps.map(function (id) {
				return '"' + id + '"';
			}).join(', '), fn.toString())
		});
	});
	
	return modules;
}

function parseCSS(code, id) {
	var deps = [];

	code = '/* ' + id + ' */\n' 
		+ code.replace(PATTTEN_IMPORT_FORMAL, function (all, quote, id) {
			deps.push(id.substring(1));
			return '';
		}).replace(PATTTEN_IMPORT_SIMPLE, function (all, quote, id) {
			deps.push(id.substring(1));
			return '';
		});
	
	return [ {
		id: id,
		dependencies: deps,
		code: code
	} ];
}

/**
 * Travel the dependencies tree.
 */
function* travel(nodes, reader, queue, visited) {
	queue = queue || [];
	visited = visited || {};

	for (let i = 0, len = nodes.length; i < len; ++i) {
		let node = nodes[i];

		if (visited[node]) {
			continue;
		}
		
		node = visited[node] = yield* reader(node);
		
		yield* travel(node.dependencies, reader, queue, visited);
		
		queue.push(node.id);
	}
	
	return {
		queue: queue,
		visited: visited
	};
}

/**
 * Filter factory.
 * @return {Function}
 */
module.exports = function () {
	return function* (next) {
		var req = this.request;
		var res = this.response;
		var base = req.base || '';
		var cache = {};
		
		yield next;
		
		function *read(pathname) {
			if (!cache[pathname]) {
				req.url(('/' + pathname).replace(base, ''));
				
				yield next;

				if (res.status() !== 200) {
					throw new Error('Cannot read ' + pathname);
				}
				
				switch (res.is('js', 'css')) {
				case 'js':
					cache[pathname] = parseJS(String(res.data()))[0];
					break;
				case 'css':
					cache[pathname] = parseCSS(String(res.data()), pathname)[0];
					break;
				default:
					throw new Error('Not a JS or CSS module (' + pathname + ')');
				}
			}

			return cache[pathname];
		}

		function *bundle(modules) {
			var entries = modules.map(function (module) {
				cache[module.id] = module;
				return module.id;
			});

			var result = yield *travel(entries, read);

			res.data(result.queue.map(function (id) {
				return result.visited[id].code
			}).join('\n'));
		}

		switch (res.is('js', 'css')) {
		case 'js':
			yield *bundle(
				parseJS(res.data() + '')
			);
			break;
		case 'css':
			yield *bundle(
				parseCSS(res.data() + ''),
				req.pathname.substring(1)
			);
			break;
		}
	};
};