'use strict';

const Toys = require('toys');
const joi = require('@hapi/joi');
const pkg = require('../package.json');

const internals = {};

module.exports = {
    pkg,
    multiple: true,
    register(server) {

        const rootState = internals.rootState(server.realm);

        if (!rootState.setup) {

            internals.setServices(rootState);

            server.decorate('server', 'registerServiceMethods', internals.registerServiceMethods);

            server.decorate('server', 'services', internals.services((srv) => srv.realm));

            server.decorate('toolkit', 'services', internals.services((toolkit) => toolkit.realm));

            server.decorate('request', 'services', internals.services((request) => request.route.realm));

            rootState.setup = true;
        }
    },
};

internals.services = (getRealm) => function internal(all) {
    const realm = getRealm(this);

    return all ? internals.rootState(realm).services : internals.state(realm).services;
};

internals.setServices = (rootState) => {
    const definition = {
        value: {},
        writable: false,
        enumerable: true,
    };
    Object.defineProperty(rootState, 'services', definition);
};

internals.rootState = (realm) => Toys.rootState(realm, pkg.name);

internals.state = (realm) => Toys.state(realm, pkg.name);

internals.schemas = joi.object({
    objConfig: joi.object().keys({
        scope: joi.string().required(),
        services: joi.array().items({
            name: joi.string().required(),
            method: joi.func().required(),
            cache: joi.object().keys({
                expiresIn: joi.number().integer(),
                generateTimeout: joi.number().integer(),
            }).optional().options({ allowUnknown: false }),
        }).required(),
        context: joi.object(),
    }),
    arrayConfig: joi.array().items(joi.lazy(() => joi.reach(internals.schemas, 'objConfig'))),
    inputs: joi.alternatives().try([
        joi.lazy(() => joi.reach(internals.schemas, 'objConfig')),
        joi.lazy(() => joi.reach(internals.schemas, 'arrayConfig')),
    ]),
});

internals.checkScope = (scope, rootState) => {
    if (rootState.services[scope]) {
        throw new Error(`A service scope of ${scope} already exists`);
    }
};

internals.registerServiceMethods = function registerServiceMethods(inputs) {

    const rootState = internals.rootState(this.realm);

    const state = internals.state(this.realm);

    if (!state.setup) {
        internals.setServices(state);
    }

    joi.assert(inputs, joi.reach(internals.schemas, 'inputs'));

    if (Array.isArray(inputs)) {
        inputs.forEach((config) => {
            internals.checkScope(config.scope, rootState);

            config.services.forEach(internals.register(config, this));
        });
    } else {
        internals.checkScope(inputs.scope, rootState);

        inputs.services.forEach(internals.register(inputs, this));
    }
};

internals.ext = (type, fn, hapi) => hapi.ext(type, fn);

internals.register = (args, hapi) => (service) => {

    const { scope, context } = args;

    const rootState = internals.rootState(hapi.realm);

    const options = {
        bind: {
            ...context,
            server: hapi,
            options: hapi.realm.pluginOptions,
        },
    };

    let method;
    if (service.cache) {
        const name = `${scope}.${service.name}`;
        hapi.method(name, service.method, {
            ...options,
            cache: service.cache,
        });

        method = hapi.methods[scope][service.name];
    } else {
        method = service.method.bind(options.bind);

        if (service.name === 'initialize') {
            internals.ext('onPreStart', method, hapi);
        }

        if (service.name === 'teardown') {
            internals.ext('onPostStop', method, hapi);
        }
    }

    rootState.services[scope] = {
        ...rootState.services[scope],
        [service.name]: method,
    };

    Toys.forEachAncestorRealm(hapi.realm, (realm) => {
        const state = internals.state(realm);

        if (!state.setup) { // it's not the root plugin
            if (!state.services) { // plugin that has not registered this plugin explicitly
                internals.setServices(state);
                state.services[scope] = {
                    ...rootState.services[scope],
                    [service.name]: method,
                };
            } else { // plugin that has explicitly registered this plugin
                state.services[scope] = {
                    ...rootState.services[scope],
                    [service.name]: method,
                };
            }
        }
    });
};
