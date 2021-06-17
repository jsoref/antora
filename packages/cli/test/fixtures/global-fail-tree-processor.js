'use strict'

const asciidoctor = require('@asciidoctor/core')()

asciidoctor.Extensions.register(function () {
  this.treeProcessor(function () {
    throw 'not today!' // eslint-disable-line no-throw-literal
  })
})