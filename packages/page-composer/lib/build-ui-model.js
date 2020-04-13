'use strict'

const { posix: path } = require('path')
const { URL } = require('url')

const { DEFAULT_LAYOUT_NAME } = require('./constants')
const { version: VERSION } = require('../package.json')

function buildSiteUiModel (playbook, contentCatalog) {
  const model = { title: playbook.site.title }

  let siteUrl = playbook.site.url
  if (siteUrl) {
    if (siteUrl === '/') {
      model.url = siteUrl
      model.path = ''
    } else {
      if (siteUrl.charAt(siteUrl.length - 1) === '/') siteUrl = siteUrl.substr(0, siteUrl.length - 1)
      if (siteUrl.charAt() === '/') {
        model.path = siteUrl
      } else if ((model.path = new URL(siteUrl).pathname) === '/') {
        model.path = ''
      }
      model.url = siteUrl
    }
  }

  const startPage = contentCatalog.getSiteStartPage()
  if (startPage) model.homeUrl = startPage.pub.url

  // QUESTION should components be pre-sorted? should we make this configurable?
  model.components = contentCatalog.getComponentMapSortedBy('title')

  model.keys = Object.entries(playbook.site.keys || {}).reduce((accum, [key, value]) => {
    if (value) accum[key] = value
    return accum
  }, {})

  const uiConfig = playbook.ui
  model.ui = {
    url: path.resolve('/', uiConfig.outputDir),
    defaultLayout: uiConfig.defaultLayout || DEFAULT_LAYOUT_NAME,
  }

  return model
}

function buildUiModel (siteModel, file, contentCatalog, navigationCatalog, env) {
  const siteRootPath = file.pub.rootPath || siteModel.path || ''
  return {
    antoraVersion: VERSION,
    contentCatalog: contentCatalog && contentCatalog.exportToModel(),
    env,
    page: buildPageUiModel(siteModel, file, contentCatalog, navigationCatalog),
    site: siteModel,
    siteRootPath,
    uiRootPath: siteRootPath + siteModel.ui.url,
  }
}

function buildPageUiModel (siteModel, file, contentCatalog, navigationCatalog) {
  const fileSrc = file.src
  if (fileSrc.stem === '404' && !fileSrc.component) return { layout: '404', title: file.title }
  const { component: componentName, version, module: module_, relative: srcPath, origin, editUrl, fileUri } = fileSrc

  // QUESTION should attributes be scoped to AsciiDoc, or should this work regardless of markup language? file.data?
  const asciidoc = file.asciidoc || {}
  const attributes = asciidoc.attributes || {}
  const pageAttributes = Object.entries(attributes).reduce((accum, [name, val]) => {
    if (name.startsWith('page-')) accum[name.substr(5)] = val
    return accum
  }, {})

  const url = file.pub.url
  const component = contentCatalog.getComponent(componentName)
  const componentVersion = contentCatalog.getComponentVersion(component, version)
  // QUESTION can we cache versions on file.rel so only computed once per page version lineage?
  const versions = component.versions.length > 1 ? getPageVersions(fileSrc, component, contentCatalog) : undefined
  const title = file.title || asciidoc.doctitle

  const model = {
    contents: file.contents,
    layout: pageAttributes.layout || siteModel.ui.defaultLayout,
    title,
    url,
    description: attributes.description,
    keywords: attributes.keywords,
    attributes: pageAttributes,
    component,
    version,
    displayVersion: componentVersion.displayVersion,
    componentVersion,
    module: module_,
    srcPath,
    origin,
    versions,
    editUrl,
    fileUri,
    home: url === siteModel.homeUrl,
  }

  if (navigationCatalog) {
    attachNavProperties(model, url, title, navigationCatalog.getNavigation(componentName, version))
  }

  if (versions) {
    Object.defineProperty(model, 'latest', {
      get () {
        return this.versions.find((candidate) => candidate.latest)
      },
    })
  }

  // NOTE site URL has already been normalized at this point
  const siteUrl = siteModel.url
  if (siteUrl && siteUrl.charAt() !== '/') {
    if (versions) {
      let latestReached
      // NOTE latest could be older than the latest component version since the page might cease to exist
      const latest = versions.find(
        (candidate) => (latestReached || (latestReached = candidate.latest)) && !candidate.missing
      )
      if (latest && !latest.prerelease) {
        let canonicalUrl = latest.url
        if (canonicalUrl === url || canonicalUrl.charAt() === '/') canonicalUrl = siteUrl + canonicalUrl
        model.canonicalUrl = file.pub.canonicalUrl = canonicalUrl
      }
    } else if (!componentVersion.prerelease) {
      model.canonicalUrl = file.pub.canonicalUrl = siteUrl + url
    }
  }

  return model
}

// QUESTION should this function go in ContentCatalog?
// QUESTION should this function accept component, module, relative instead of pageSrc?
function getPageVersions (pageSrc, component, contentCatalog) {
  const basePageId = { component: component.name, module: pageSrc.module, family: 'page', relative: pageSrc.relative }
  return component.versions.map((componentVersion) => {
    const page = contentCatalog.getById(Object.assign({ version: componentVersion.version }, basePageId))
    // QUESTION should title be title of component or page?
    return Object.assign(
      componentVersion === component.latest ? { latest: true } : {},
      componentVersion,
      page ? { url: page.pub.url } : { missing: true }
    )
  })
}

function attachNavProperties (model, url, title, navigation = []) {
  if (!(model.navigation = navigation).length) return
  const { current, ancestors, previous, next } = findNavItem({ url, ancestors: [], seekNext: true }, navigation)
  if (current) {
    // QUESTION should we filter out component start page from the breadcrumbs?
    const breadcrumbs = ancestors.filter((item) => 'content' in item)
    const parent = breadcrumbs.find((item) => item.urlType === 'internal')
    breadcrumbs.reverse().push(current)
    model.breadcrumbs = breadcrumbs
    if (parent) model.parent = parent
    if (previous) model.previous = previous
    if (next) model.next = next
  } else if (title) {
    model.breadcrumbs = [{ content: title, url, urlType: 'internal', discrete: true }]
  }
}

function findNavItem (correlated, siblings, root = true, siblingIdx = 0, candidate = undefined) {
  if (!(candidate = candidate || siblings[siblingIdx])) {
    return correlated
  } else if (correlated.current) {
    if (candidate.urlType === 'internal') {
      correlated.next = candidate
      return correlated
    }
  } else if (candidate.urlType === 'internal') {
    if (getUrlWithoutHash(candidate) === correlated.url) {
      correlated.current = candidate
      /* istanbul ignore if */
      if (!correlated.seekNext) return correlated
    } else {
      correlated.previous = candidate
    }
  }
  const children = candidate.items || []
  if (children.length) {
    const ancestors = correlated.ancestors
    correlated = findNavItem(
      correlated.current ? correlated : Object.assign({}, correlated, { ancestors: [candidate].concat(ancestors) }),
      children,
      false
    )
    if (correlated.current) {
      if (!correlated.seekNext || correlated.next) return correlated
    } else {
      correlated.ancestors = ancestors
    }
  }
  if (++siblingIdx < siblings.length) {
    correlated = findNavItem(correlated, siblings, root, siblingIdx)
    //if (correlated.current && (!correlated.seekNext || correlated.next)) return correlated
  } else if (root && !correlated.current) {
    delete correlated.previous
  }
  return correlated
}

function getUrlWithoutHash (item) {
  return item.hash ? item.url.substr(0, item.url.length - item.hash.length) : item.url
}

module.exports = { buildSiteUiModel, buildPageUiModel, buildUiModel }
