'use strict'

const { promises: fsp } = require('fs')
const ospath = require('path')
const format = require('prettier-eslint')

function flattenDeep (array, accum = []) {
  const len = array.length
  for (let i = 0, it; i < len; i++) Array.isArray((it = array[i])) ? flattenDeep(it, accum) : accum.push(it)
  return accum
}

function formatAll (dirs, ignores, cwd = process.cwd()) {
  return dirs.reduce(
    (accum, dir) =>
      fsp.readdir((dir = ospath.join(cwd, dir)), { withFileTypes: true }).then((dirents) => {
        const subdirs = []
        const jsfiles = []
        for (const dirent of dirents) {
          const name = dirent.name
          dirent.isDirectory()
            ? name !== 'node_modules' && subdirs.push(name)
            : name.endsWith('.js') && jsfiles.push(name)
        }
        const promises = subdirs.length ? [formatAll(subdirs, ignores, dir)] : []
        for (const jsfile of jsfiles) {
          const filePath = ospath.join(dir, jsfile)
          if (~ignores.indexOf(filePath)) continue
          promises.push(
            fsp.readFile(filePath, 'utf8').then((text) => {
              const result = format({ text, filePath })
              return result === text ? false : fsp.writeFile(filePath, result).then(() => true)
            })
          )
        }
        return Promise.all(promises).then((resolved) => accum.then((accumResolved) => [...accumResolved, ...resolved]))
      }),
    Promise.resolve([])
  )
}

;(async (dirlist) => {
  const cwd = process.cwd()
  const ignores = await fsp.readFile('.eslintignore', 'utf8').then((contents) =>
    contents
      .trimRight()
      .split('\n')
      .map((it) => ospath.join(cwd, it))
  )
  await formatAll(dirlist.split(','), ignores, cwd).then((result) => {
    if (process.env.npm_config_loglevel !== 'silent') {
      const total = (result = flattenDeep(result)).length
      const changed = result.filter((it) => it).length
      const unchanged = total - changed
      const changedStatus = `changed ${changed} file${changed === 1 ? '' : 's'}`
      const unchangedStatus = `left ${unchanged} file${unchanged === 1 ? '' : 's'} unchanged`
      console.log(`prettier-eslint ${changedStatus} and ${unchangedStatus}`)
    }
  })
})(process.argv[2] || '')