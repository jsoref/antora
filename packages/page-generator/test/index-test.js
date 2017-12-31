/* eslint-env mocha */
'use strict'

const { expect, heredoc, spy } = require('../../../test/test-utils')
const createPageGenerator = require('@antora/page-generator')

describe('createPageGenerator()', () => {
  let contentCatalog
  let helpers
  let layouts
  let partials
  let playbook
  let uiCatalog

  const replaceCallToBodyPartial = (replacement) => {
    const defaultLayout = layouts.find((layout) => layout.stem === 'default')
    defaultLayout.contents = Buffer.from(defaultLayout.contents.toString().replace('{{> body}}', replacement))
  }

  beforeEach(() => {
    playbook = {
      site: {
        title: 'Docs Site',
      },
      ui: {
        outputDir: '_/',
      },
    }

    helpers = [
      {
        stem: 'upper',
        contents: Buffer.from(heredoc`
          module.exports = (str) => str.toUpperCase()
        ` + '\n'),
      },
      {
        stem: 'eq',
        contents: Buffer.from(heredoc`
          module.exports = (a, b) => a === b
        ` + '\n'),
      },
    ]

    layouts = [
      {
        stem: 'default',
        contents: Buffer.from(heredoc`
          <!DOCTYPE html>
          <html class="default">
          {{> head}}
          {{> body}}
          </html>
        ` + '\n'),
      },
      {
        stem: 'chapter',
        contents: Buffer.from(heredoc`
          <!DOCTYPE html>
          <html class="chapter">
          {{> head}}
          {{> body}}
          </html>
        ` + '\n'),
      },
    ]

    partials = [
      {
        stem: 'head',
        contents: Buffer.from(heredoc`
          <title>{{page.title}}</title>
          {{#if page.description}}
          <meta name="description" content="{{page.description}}">
          {{/if}}
        ` + '\n'),
      },
      {
        stem: 'body',
        contents: Buffer.from(heredoc`
          <article>
            <h1>{{{page.title}}}</h1>
            {{{page.contents}}}
          </article>
        ` + '\n'),
      },
      {
        stem: 'body-upper-title',
        contents: Buffer.from(heredoc`
          <h1>{{{upper page.title}}}</h1>
          {{{page.contents}}}
        ` + '\n'),
      },
      {
        stem: 'body-component-equality',
        contents: Buffer.from(heredoc`
          {{#each site.components}}
          {{#if (eq . @root.page.component)}}
          <p>The current component is {{./name}}.</p>
          {{/if}}
          {{/each}}
        ` + '\n'),
      },
      {
        stem: 'body-undefined-property-reference',
        contents: Buffer.from(heredoc`
          {{#unless page.noSuchThang.name}}
          <p>No such thang.</p>
          {{/unless}}
        ` + '\n'),
      },
    ]

    contentCatalog = {
      getComponents: () => [],
    }

    uiCatalog = {
      findByType: spy((type) => {
        if (type === 'layout') return layouts
        if (type === 'partial') return partials
        if (type === 'helper') return helpers
      }),
    }
  })

  it('should create a page generator function', () => {
    const generatePage = createPageGenerator(playbook, contentCatalog, uiCatalog)
    expect(generatePage).to.be.instanceOf(Function)
  })

  it('should operate on helper, partial, and layout files from UI catalog', () => {
    createPageGenerator(playbook, contentCatalog, uiCatalog)
    const types = uiCatalog.findByType.__spy.calls.map((call) => call[0]).sort((a, b) => a.localeCompare(b, 'en'))
    expect(types).to.eql(['helper', 'layout', 'partial'])
  })

  describe('generatePage()', () => {
    let component
    let components
    let file
    let menu
    let navigationCatalog

    beforeEach(() => {
      component = { 
        name: 'the-component',
        title: 'The Component',
        url: '/the-component/1.0/index.html',
        versions: [
          {
            version: '1.0',
            title: 'The Component',
            url: '/the-component/1.0/index.html',
          },
        ],
      }

      components = [component]

      file = {
        contents: Buffer.from('<p>the contents</p>'),
        src: {
          path: 'modules/ROOT/pages/the-page.adoc',
          component: 'the-component',
          version: '1.0',
          module: 'ROOT',
          relative: 'the-page.adoc'
        },
        pub: {
          url: '/the-component/1.0/the-page.html',
          rootPath: '../..',
        },
        asciidoc: {
          doctitle: 'The Page',
          attributes: {
            description: 'The description of the page.',
          },
        }
      }

      contentCatalog = {
        getComponent: spy((name) => component),
        getComponents: spy(() => components),
      }

      menu = []

      navigationCatalog = {
        getMenu: (name, version) => menu,
      }
    })

    it('should execute the default template against the UI model', () => {
      const generatePage = createPageGenerator(playbook, contentCatalog, uiCatalog)
      generatePage(file, contentCatalog, navigationCatalog)
      expect(file.contents).to.be.instanceOf(Buffer)
      expect(file.contents.toString().trim()).to.equal(heredoc`
        <!DOCTYPE html>
        <html class="default">
        <title>The Page</title>
        <meta name="description" content="The description of the page.">
        <article>
          <h1>The Page</h1>
          <p>the contents</p>
        </article>
        </html>
      `)
    })

    it('should apply helper function to template variable', () => {
      replaceCallToBodyPartial('{{> body-upper-title}}')
      const generatePage = createPageGenerator(playbook, contentCatalog, uiCatalog)
      generatePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<h1>THE PAGE</h1>')
    })

    it('should not indent preformatted content', () => {
      replaceCallToBodyPartial('  {{> body}}')
      file.contents = Buffer.from(heredoc`
        <pre>a
        b
        c</pre>
      `)
      const generatePage = createPageGenerator(playbook, contentCatalog, uiCatalog)
      generatePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<pre>a\nb\nc</pre>')
    })

    it('should be able to compare component with entry in component list for equality', () => {
      replaceCallToBodyPartial('{{> body-component-equality}}')
      const generatePage = createPageGenerator(playbook, contentCatalog, uiCatalog)
      generatePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<p>The current component is the-component.</p>')
    })

    it('should be able to access a property that is not defined', () => {
      replaceCallToBodyPartial('{{> body-undefined-property-reference}}')
      const generatePage = createPageGenerator(playbook, contentCatalog, uiCatalog)
      generatePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<p>No such thang.</p>')
    })

    it('should use default layout specified in playbook', () => {
      playbook.ui.defaultLayout = 'chapter'
      const generatePage = createPageGenerator(playbook, contentCatalog, uiCatalog)
      generatePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<html class="chapter">')
    })

    it('should use the layout specified by page-layout attribute on file', () => {
      file.asciidoc.attributes['page-layout'] = 'chapter'
      const generatePage = createPageGenerator(playbook, contentCatalog, uiCatalog)
      generatePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<html class="chapter">')
    })

    it('should use default layout if layout specified in page-layout attribute does not exist', () => {
      file.asciidoc.attributes['page-layout'] = 'does-not-exist'
      const generatePage = createPageGenerator(playbook, contentCatalog, uiCatalog)
      generatePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<html class="default">')
    })

    // QUESTION should this be checked in the function generator?
    it('should throw an error if default layout cannot be found', () => {
      playbook.ui.defaultLayout = 'does-not-exist'
      const generatePage = createPageGenerator(playbook, contentCatalog, uiCatalog)
      expect(() => generatePage(file, contentCatalog, navigationCatalog)).to.throw(/layout does-not-exist not found/i)
    })

    it('should throw an error if layout specified in page-layout attribute does not exist and is default', () => {
      playbook.ui.defaultLayout = 'also-does-not-exist'
      file.asciidoc.attributes['page-layout'] = 'does-not-exist'
      const generatePage = createPageGenerator(playbook, contentCatalog, uiCatalog)
      expect(() => generatePage(file, contentCatalog, navigationCatalog)).to.throw(/neither layout/i)
    })

    // QUESTION what should we do with a template execution error? (e.g., missing partial or helper)
  })
})
