'use strict';

const Hapi = require('@hapi/hapi');
const Lab = require('@hapi/lab');
const ChaiAsPromised = require('chai-as-promised');
const Pkg = require('../package.json');

const { script, assertions } = Lab;
const { describe, it } = exports.lab = script();
assertions.use(ChaiAsPromised);
assertions.should();

const Plugin = require('..');

describe('Plugin', () => {

    it('decorates Hapi server interface with registerServiceMethods() util', async () => {

        const server = Hapi.Server();
        (server.registerServiceMethods === undefined).should.equal(true);

        await server.register(Plugin);
        server.registerServiceMethods.should.be.a('function');
    });

    it('decorates Hapi server interface with services() util', async () => {

        const server = Hapi.Server();
        (server.services === undefined).should.equal(true);

        await server.register(Plugin);
        server.services.should.be.a('function');
    });

    it('decorates Hapi request interface with services() util', async () => {

        const server = Hapi.Server();
        await server.register(Plugin);
        server.route({
            method: 'GET',
            path: '/test',
            handler(request) {

                return request.services.should.be.a('function');
            }
        });
        const request = {
            method: 'GET',
            url: '/test'
        };

        await server.inject(request);
    });

    it('decorates Hapi toolkit interface with services() util', async () => {

        const server = Hapi.Server();
        await server.register(Plugin);
        server.route({
            method: 'GET',
            path: '/test',
            handler(request, h) {

                h.services.should.be.a('function');
                return h.services();
            }
        });
        const request = {
            method: 'GET',
            url: '/test'
        };

        await server.inject(request);
    });

    it('can be registered multiple times', async () => {

        const pluginOne = {
            pkg: { name: 'pluginOne' },
            async register(server) {

                const service = {
                    scope: 'blue',
                    services: [
                        {
                            name: 'one',
                            method: () => true
                        }
                    ]
                };
                await server.register(Plugin);

                server.registerServiceMethods(service);
            }
        };
        const pluginTwo = {
            pkg: { name: 'pluginTwo' },
            async register(server) {

                const service = {
                    scope: 'red',
                    services: [
                        {
                            name: 'one',
                            method: () => true
                        }
                    ]
                };
                await server.register(Plugin);

                server.registerServiceMethods(service);
            }
        };
        const subject = async () => {

            const server = Hapi.Server();

            await server.register({
                plugin: pluginOne,
                options: { key: 'value' }
            });
            await server.register({
                plugin: pluginTwo,
                options: { key2: 'value2' }
            });
            const services = server.services();

            services.blue.one.should.exist;
            services.red.one.should.exist;
        };

        await subject().should.be.fulfilled;
    });

    describe('.registerServiceMethods()', () => {

        it('accepts a single object argument and registers services to server under correct scope', async () => {

            const server = Hapi.Server();
            const service = {
                scope: 'sqs',
                services: [
                    {
                        name: 'init',
                        method: () => 'hello'
                    }
                ]
            };
            await server.register(Plugin);

            server.registerServiceMethods(service);

            const services = server.services();

            services.sqs.init.should.be.a('function');
        });

        it('accepts a single array of objects and registers services to server under correct scope', async () => {

            const server = Hapi.Server();
            const services = [
                {
                    scope: 'sqs',
                    services: [
                        {
                            name: 'init',
                            method: () => 'hello'
                        }
                    ]
                },
                {
                    scope: 'rabbitMq',
                    services: [
                        {
                            name: 'init',
                            method: () => 'hello'
                        }
                    ]
                }
            ];
            await server.register(Plugin);

            server.registerServiceMethods(services);

            const { sqs, rabbitMq } = server.services();

            sqs.init.should.be.a('function');
            rabbitMq.init.should.be.a('function');
        });

        it('binds services up the entire realm chain', async (flags) => {

            let services;
            const server = Hapi.Server();
            const pluginA = {
                pkg: { name: 'pluginA' },
                register(srv) {

                    const service = {
                        scope: 'first',
                        services: [
                            {
                                name: 'method',
                                method: () => true
                            }
                        ]
                    };
                    srv.register(Plugin);
                    srv.registerServiceMethods(service);
                }
            };
            const pluginB = {
                pkg: { name: 'pluginB' },
                register(srv) {

                    srv.register(pluginA);
                    srv.route({
                        method: 'GET',
                        path: '/test',
                        handler(request) {

                            services = request.services();
                            return { ok: true };
                        }
                    });
                }
            };
            const request = {
                method: 'GET',
                url: '/test'
            };
            server.register(pluginB);

            await server.inject(request);

            services.should.have.keys(['first']);

            flags.note(`Services will be made avaiLable to a plugin that does not register ${Pkg.name} but registers a plugin that registers ${Pkg.name}.`);
        });

        it('binds Hapi server to service context', async () => {

            const server = Hapi.Server();
            const service = {
                scope: 'sqs',
                services: [
                    {
                        name: 'init',
                        method() {

                            this.server.should.be.an('object');
                        }
                    }
                ]
            };
            await server.register(Plugin);

            server.registerServiceMethods(service);

            const { sqs } = server.services();

            sqs.init();
        });

        it('binds plugin options to service context', async () => {

            const server = Hapi.Server();
            const service = {
                scope: 'sqs',
                services: [
                    {
                        name: 'init',
                        method() {

                            this.options.should.be.an('object');
                        }
                    }
                ]
            };
            await server.register(Plugin);

            server.registerServiceMethods(service);

            const { sqs } = server.services();

            sqs.init();
        });

        it('accepts an optional context config which will be bound to service context when passed in (config.context)', async () => {

            class SQS {}

            const server = Hapi.Server();
            const service = {
                scope: 'sqs',
                context: {
                    client: new SQS()
                },
                services: [
                    {
                        name: 'init',
                        method() {

                            this.client.should.be.an('object');
                            this.client.should.be.an.instanceOf(SQS);
                        }
                    }
                ]
            };
            await server.register(Plugin);

            server.registerServiceMethods(service);

            const { sqs } = server.services();

            sqs.init();
        });

        it('service objects accept an optional cache config object (config.services.cache)', async () => {

            const calls = [];
            const server = Hapi.Server();
            const service = {
                scope: 'sqs',
                services: [
                    {
                        name: 'init',
                        method(input) {

                            calls.push(input);
                            return input;
                        },
                        cache: {
                            expiresIn: 100,
                            generateTimeout: 2
                        }
                    }
                ]
            };
            await server.register(Plugin);

            server.registerServiceMethods(service);

            await server.initialize();

            // call method twice and assert that it's called once
            await server.methods.sqs.init(true);
            await server.methods.sqs.init(true);

            calls.length.should.equal(1);

            // allow cache to expire and call once more
            await new Promise((resolve) => {

                setTimeout(resolve, 100);
            });
            await server.methods.sqs.init(true);

            calls.length.should.equal(2);
        });
    });

    describe('.services()', () => {

        it('by default returns services defined by registering plugin', async () => {

            const server = Hapi.Server();
            await server.register(Plugin);
            const pluginOne = {
                pkg: { name: 'pluginOne' },
                register(srv) {

                    const service = {
                        scope: 'blue',
                        services: [
                            {
                                name: 'one',
                                method: () => true
                            }
                        ]
                    };
                    srv.registerServiceMethods(service);

                    srv.route({
                        method: 'GET',
                        path: '/test2',
                        handler(request) {

                            request.services().should.have.keys(['blue']);
                            return { ok: true };
                        }
                    });
                }
            };
            const pluginTwo = {
                pkg: { name: 'pluginTwo' },
                register(srv) {

                    const service = {
                        scope: 'red',
                        services: [
                            {
                                name: 'one',
                                method: () => true
                            }
                        ]
                    };
                    srv.registerServiceMethods(service);

                    srv.route({
                        method: 'GET',
                        path: '/test',
                        handler(request) {

                            request.services().should.have.keys(['red']);
                            return { ok: true };
                        }
                    });
                }
            };
            await server.register({
                plugin: pluginOne,
                options: { key: 'value' }
            });
            await server.register({
                plugin: pluginTwo,
                options: { key2: 'value2' }
            });
            const request = {
                method: 'GET',
                url: '/test'
            };
            const request2 = {
                method: 'GET',
                url: '/test2'
            };

            await server.inject(request);
            await server.inject(request2);
        });

        it('returns all services defined up the entire realm chain when passed a truthy boolean argument', async () => {

            const server = Hapi.Server();
            await server.register(Plugin);
            const pluginOne = {
                pkg: { name: 'pluginOne' },
                register(srv) {

                    const service = {
                        scope: 'blue',
                        services: [
                            {
                                name: 'one',
                                method: () => true
                            }
                        ]
                    };
                    srv.registerServiceMethods(service);

                    srv.route({
                        method: 'GET',
                        path: '/test2',
                        handler(request) {

                            request.services(true).should.have.keys(['blue', 'red']);
                            return { ok: true };
                        }
                    });
                }
            };
            const pluginTwo = {
                pkg: { name: 'pluginTwo' },
                register(srv) {

                    const service = {
                        scope: 'red',
                        services: [
                            {
                                name: 'one',
                                method: () => true
                            }
                        ]
                    };
                    srv.registerServiceMethods(service);

                    srv.route({
                        method: 'GET',
                        path: '/test',
                        handler(request) {

                            request.services(true).should.have.keys(['red', 'blue']);
                            return { ok: true };
                        }
                    });
                }
            };
            await server.register({
                plugin: pluginOne,
                options: { key: 'value' }
            });
            await server.register({
                plugin: pluginTwo,
                options: { key2: 'value2' }
            });
            const request = {
                method: 'GET',
                url: '/test'
            };
            const request2 = {
                method: 'GET',
                url: '/test2'
            };

            await server.inject(request);
            await server.inject(request2);
        });
    });

    it('runs initialize() onPreStart and teardown() onPostStop (Object argument)', async () => {

        let initialized = false;
        let toredown = false;
        const server = Hapi.Server();
        await server.register(Plugin);
        const service = {
            scope: 'sqs',
            services: [
                {
                    name: 'initialize',
                    method() {

                        initialized = true;
                    }
                },
                {
                    name: 'teardown',
                    method() {

                        toredown = true;
                    }
                }
            ]
        };
        server.registerServiceMethods(service);

        await server.initialize();

        await server.stop();

        initialized.should.equal(true);
        toredown.should.equal(true);
    });

    it('runs initialize() onPreStart and teardown() onPostStop (Array argument)', async () => {

        let initialized = false;
        let toredown = false;
        const server = Hapi.Server();
        await server.register(Plugin);
        const service = [
            {
                scope: 'sqs',
                services: [
                    {
                        name: 'initialize',
                        method() {

                            initialized = true;
                        }
                    },
                    {
                        name: 'teardown',

                        method() {

                            toredown = true;
                        }
                    }
                ]
            }
        ];
        server.registerServiceMethods(service);

        await server.initialize();

        await server.stop();

        initialized.should.equal(true);
        toredown.should.equal(true);
    });

    it('throws when scope is not provided', async () => {

        const server = Hapi.Server();
        const services = [
            {
                services: [
                    {
                        name: 'init',
                        method: () => 'hello'
                    }
                ]
            }
        ];
        await server.register(Plugin);

        (() => {

            server.registerServiceMethods(services);
        }).should.throw(Error, '"scope" is required');
    });

    it('throws when services is not provided', async () => {

        const server = Hapi.Server();
        const services = [
            {
                scope: 'scope'
            }
        ];
        await server.register(Plugin);

        (() => {

            server.registerServiceMethods(services);
        }).should.throw(Error, '"services" is required');
    });

    it('throws when service name is not provided', async () => {

        const server = Hapi.Server();
        const services = [
            {
                scope: 'scope',
                services: [
                    {
                        method: () => 'hello'
                    }
                ]
            }
        ];
        await server.register(Plugin);

        (() => {

            server.registerServiceMethods(services);
        }).should.throw(Error, '"name" is required');
    });

    it('throws when service method is not provided', async () => {

        const server = Hapi.Server();
        const services = [
            {
                scope: 'scope',
                services: [
                    {
                        name: 'init'
                    }
                ]
            }
        ];
        await server.register(Plugin);

        (() => {

            server.registerServiceMethods(services);
        }).should.throw(Error, '"method" is required');
    });

    it('throws when trying to register services that have the same scope when using array argument', async () => {

        const server = Hapi.Server();
        const services = [
            {
                scope: 'thing',
                services: [
                    {
                        name: 'one',
                        method: () => true
                    }
                ]
            },
            {
                scope: 'thing',
                services: [
                    {
                        name: 'two',
                        method: () => true
                    }
                ]
            }
        ];
        await server.register(Plugin);

        (() => {

            server.registerServiceMethods(services);
        }).should.throw(Error, 'A service scope of thing already exists');
    });

    it('throws when trying to register serices that have the same scope when using object argument', async () => {

        const server = Hapi.Server();
        const service1 = {
            scope: 'thing',
            services: [
                {
                    name: 'one',
                    method: () => true
                }
            ]
        };
        const service2 = {
            scope: 'thing',
            services: [
                {
                    name: 'two',
                    method: () => true
                }
            ]
        };
        await server.register(Plugin);

        server.registerServiceMethods(service1);

        (() => {

            server.registerServiceMethods(service2);
        }).should.throw(Error, 'A service scope of thing already exists');
    });

    it('throws when separate plugins attempt to register services that have the same scope', async () => {

        const mainServer = Hapi.Server();
        const pluginOne = {
            pkg: {
                name: 'pluginOne'
            },
            register(server) {

                const service = {
                    scope: 'blue',
                    services: [
                        {
                            name: 'one',
                            method: () => true
                        }
                    ]
                };
                server.registerServiceMethods(service);
            }
        };
        const pluginTwo = {
            pkg: {
                name: 'pluginTwo'
            },
            register(server) {

                const service = {
                    scope: 'blue',
                    services: [
                        {
                            name: 'two',
                            method: () => true
                        }
                    ]
                };
                server.registerServiceMethods(service);
            }
        };

        const subject = async () => {

            await mainServer.register(Plugin);
            await mainServer.register(pluginOne);
            await mainServer.register(pluginTwo);
        };

        await subject().should.be.rejectedWith(Error, 'A service scope of blue already exists');
    });
});
