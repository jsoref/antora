'use strict'

// matches pattern version@component:module:family$relative
// ex. 1.0@antora:asciidoc:syntax/lists.adoc
const RESOURCE_ID_RX = /^(?:([^@:$]+)@)?(?:(?:([^@:$]+):)?(?:([^@:$]+))?:)?(?:([^@:$]+)\$)?([^@:$]+)$/
const RESOURCE_ID_RX_GROUP = { version: 1, component: 2, module: 3, family: 4, relative: 5 }

/**
 * Parses a contextual resource ID spec into a file src object.
 *
 * Parses the specified resource ID spec to produce a resource ID object (an identifier shorthand
 * that corresponds to the identity stored in the src property of a virtual file). If a context
 * object is provided, it will be used to qualify the identifier, populating the component, version,
 * and/or module properties, as necessary.
 *
 * * If a component is specified, but not a version, the version remains undefined.
 * * If a component is specified, but not a module, the module defaults to "ROOT".
 * * If the family is not specified, and families are not specified, the family defaults to "page".
 *
 * @memberof content-classifier
 *
 * @param {String} spec - The contextual resource ID spec (e.g.,
 *   version@component:module:family$relative).
 * @param {Object} [ctx={}] - The src context.
 * @param {Array} families - A list of permitted families. If specified, the first entry is used
 *   as the default family if no family is specified in the spec.
 *
 * @returns {Object} A resource ID object that can be used to look up the file in the content
 * catalog. If the spec is malformed, or the family is unrecognized, this function returns undefined.
 */
function parseResourceId (spec, ctx = {}, families = undefined) {
  const match = spec.match(RESOURCE_ID_RX)
  if (!match) return

  let family = match[RESOURCE_ID_RX_GROUP.family]
  if (family) {
    if (families && !families.includes(family)) family = undefined
  } else {
    family = families ? families[0] : 'page'
  }

  let version = match[RESOURCE_ID_RX_GROUP.version]
  let component = match[RESOURCE_ID_RX_GROUP.component]
  let module = match[RESOURCE_ID_RX_GROUP.module]
  let relative = match[RESOURCE_ID_RX_GROUP.relative]
  if (family === 'page' && !relative.endsWith('.adoc')) relative += '.adoc'

  if (component) {
    if (!module) module = 'ROOT'
  } else {
    component = ctx.component
    if (!version) version = ctx.version
    if (!module) module = ctx.module
  }

  return { component, version, module, family, relative }
}

module.exports = parseResourceId
