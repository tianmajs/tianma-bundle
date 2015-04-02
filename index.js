'use strict';

var libc = require('libc');
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

function* travel(nodes, reader, queue, visited) {
	var i = 0,
		len = nodes.length,
		node;

	queue = queue || [];
	visited = visited || {};

	for (; i < len; ++i) {
		node = nodes[i];

		if (visited[node]) {
			continue;
		}
		
		node = visited[node] = yield* reader(node);
		
		yield* travel(node.dependencies, reader, queue, visited);
		
		queue.push(node.id);
	}
	
	return [ queue, visited ];
}

module.exports = function (mode) {
	mode = mode || 'simple';

	return function* (next) {
		var req = this.request,
			res = this.response,
			base = req.base || '';
			cache = {};
		
		yield next;
		
		function* read(pathname) {
			if (!cache[pathname]) {
				req.url(('/' + pathname).replace(base, ''));
				
				yield next;
				
				switch (res.is('js', 'css')) {
				case 'js':
					cache[pathname] = parseJS(String(res.data()))[0];
					break;
				case 'css':
					cache[pathname] = parseCSS(String(res.data()), pathname)[0];
					break;
				}
			}

			return cache[pathname];
		}
		
		switch (res.is('js', 'css')) {
		case 'js':
			var modules = parseJS(String(res.data())),
				queue,
				cache;
				
			queue = modules.map(function (module) {
				cache[module.id] = module;
				return module.id;
			});

			var ret = yield *travel(queue, read);
			
			queue = ret[0];
			var visited = ret[1];

			var data = queue.map(function (id) {
				return visited[id].code;
			}).join('\n');

			if (mode !== 'simple') {
				data = libc(data, mode);
			}
			
			res.data(data);
			break;
		case 'css':
			var modules = parseCSS(String(res.data()), req.pathname.substring(1)),
				queue = modules[0].dependencies;
	
			var ret = yield *travel(queue, read);
			
			queue = ret[0];
			var visited = ret[1];

			var data = queue.map(function (id) {
				return visited[id].code;
			}).concat(modules[0].code).join('\n');
			
			res.data(data);
			break;
		}
	};
};