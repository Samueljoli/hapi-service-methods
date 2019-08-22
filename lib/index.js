'use strict';

const joi = require('@hapi/joi');
const pkg = require('../package.json');

const internals = {};

module.exports = {
    pkg,
    register(server) {

        server.decorate('server', 'registerServiceMethods', internals.registerServiceMethods(server));
    },
};

internals.schemas = joi.object({
    object: joi.object().keys({
        scope: joi.string().required(),
        services: joi.array().items({
            name: joi.string().required(),
            service: joi.func().required(),
            cache: joi.object().keys({
                expiresIn: joi.number().integer(),
                generateTimeout: joi.number().integer(),
            }).optional().options({ allowUnknown: false }),
        }).required(),
        context: joi.object(),
    }),
    array: joi.array().items(joi.lazy(() => joi.reach(internals.schemas, 'object'))),
    inputs: joi.alternatives().try([
        joi.lazy(() => joi.reach(internals.schemas, 'object')),
        joi.lazy(() => joi.reach(internals.schemas, 'array')),
    ]),
});

internals.register = (server, args) => (service) => {

    const { scope, context } = args;
    const name = `${scope}.${service.name}`;
    const options = {
        bind: {
            ...context,
            server,
        },
    };

    if (service.cache) {
        options.cache = service.cache;
    }

    server.method(name, service.service, options);
};

internals.registerServiceMethods = (server) => (inputs) => {

    const { register, schemas } = internals;

    joi.assert(inputs, joi.reach(schemas, 'inputs'));

    if (Array.isArray(inputs)) {
        inputs.forEach((config) => {
            config.services.forEach(register(server, config));
        });
    } else {
        inputs.services.forEach(register(server, inputs));
    }
};
