'use strict';

var http = require('http');
var bundle = require('..');
var request = require('supertest');
var tianma = require('tianma');
var path = require('path');

var FILE = {
    '/a.css': '@import "/b.css";@import "/c.css";\naaa',
    '/b.css': 'bbb',
    '/c.css': 'ccc',
    '/x.css': '@import "/y.css";\nxxx',
    '/y.css': '@import "/x.css";\nyyy',
    '/ba.css':
        'bbb\n' +
        '@import "/b.css";@import "/c.css";\naaa',
    '/a.js': 'define("a.js",["b.js","c.js"],function(){var aaa;});',
    '/b.js': 'define("b.js",[],function(){var bbb;});',
    '/c.js': 'define("c.js",[],function(){var ccc;});',
    '/x.js': 'define("x.js",["y.js"],function(){var xxx;});',
    '/y.js': 'define("y.js",["x.js"],function(){var yyy;});',
    '/ba.js':
        'define("b.js",[],function(){var bbb;});\n' +
        'define("a.js",["b.js","c.js"],function(){var aaa;});'
};

function createApp() {
    var app = tianma();
    var server = http.createServer(app.run);

    app.server = server;

    return app;
}

describe('bundle()', function () {
    function createServer() {
        var app = createApp();

        app.use(bundle())
            .use(function *(next) {
                var req = this.request;
                var res = this.response;

                res.status(200)
                    .type(path.extname(req.pathname))
                    .data(FILE[req.pathname]);
            });

        return app.server;
    }

    it('should support bundle js modules', function (done) {
        request(createServer())
            .get('/a.js')
            .expect(200)
            .expect(/bbb[\s\S]*ccc[\s\S]*aaa/)
            .end(done);
    });

    it('should break circular js module dependencies', function (done) {
        request(createServer())
            .get('/y.js')
            .expect(200)
            .expect(/xxx[\s\S]*yyy/)
            .end(done);
    });

    it('should parse concated js modules', function (done) {
        request(createServer())
            .get('/ba.js')
            .expect(200)
            .expect(/bbb[\s\S]*ccc[\s\S]*aaa/)
            .end(done);
    });

    it('should support bundle css modules', function (done) {
        request(createServer())
            .get('/a.css')
            .expect(200)
            .expect(/bbb[\s\S]*ccc[\s\S]*aaa/)
            .end(done);
    });

    it('should break circular css module dependencies', function (done) {
        request(createServer())
            .get('/x.css')
            .expect(200)
            .expect(/yyy[\s\S]*xxx/)
            .end(done);
    });

    it('should parse concated css modules', function (done) {
        request(createServer())
            .get('/ba.css')
            .expect(200)
            .expect(/bbb[\s\S]*ccc[\s\S]*aaa/)
            .end(done);
    });
});
