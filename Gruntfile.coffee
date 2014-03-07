module.exports = (grunt) ->

  grunt.loadNpmTasks 'grunt-contrib-clean'
  grunt.loadNpmTasks 'grunt-contrib-uglify'
  grunt.loadNpmTasks 'grunt-mocha-test'
  grunt.loadNpmTasks 'grunt-notify'
  grunt.loadNpmTasks 'grunt-testem'
  grunt.loadNpmTasks 'grunt-text-replace'


  grunt.initConfig

    _files:
      main: '<%= _pkg.main %>'
      minified: '<%= _pkg.main.replace("\\.js$", ".min.js") %>'

    _paths:
      root: __dirname

    _pkg: grunt.file.readJSON 'package.json'


    mochaTest:
      options:
        grep: '<%= grunt.cli.options.grep ? grunt.cli.options.grep : "" %>'
      main:
        src: ['test/index.js']

    replace:
      version:
        src: [
          'package.json'
          '<%= _files.main %>'
        ]
        overwrite: true
        replacements: [
          from: /(['"])0\.0\.0(['"])/
          to: '$10.0.1$2'
        ]

    uglify:
      main:
        files:
          '<%= _files.main %>': ['<%= _files.minified %>']


  grunt.registerTask 'default', ['mochaTest:main']
