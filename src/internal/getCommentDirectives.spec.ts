import * as graphql from 'graphql'
import { describe, it } from 'mocha'
import { expect } from 'chai'
import getCommentDirectives from './getCommentDirectives'

function fragment([
  text,
]: TemplateStringsArray): graphql.FragmentDefinitionNode {
  const doc = graphql.parse(text)
  if (doc.definitions.length !== 1)
    throw new Error('document must have one definition')
  const [def] = doc.definitions
  if (def.kind !== 'FragmentDefinition')
    throw new Error('document must have a single fragment definition')
  return def
}

function field([text]: TemplateStringsArray): graphql.FieldNode {
  const frag = fragment([
    `fragment Foo on Bar {
    ${text}
  }`,
  ] as any)
  if (frag.selectionSet.selections.length !== 1)
    throw new Error('only one field must be given')
  const [field] = frag.selectionSet.selections
  if (field.kind !== 'Field') throw new Error('only selection must be a field')
  return field
}

describe(`getCommentDirectives`, function() {
  it(`throws on invalid directive`, function() {
    expect(
      () =>
        getCommentDirectives(
          fragment`
        # @graphql-typegen readOnly blah
        fragment Foo on Bar {
          baz
        }
      `,
          process.cwd()
        ).objectType
    ).to.throw('invalid directive: blah')
  })
  describe(`multiple directives`, function() {
    it(`works`, function() {
      const config = getCommentDirectives(
        fragment`
        # @graphql-typegen readOnly exact
        # @graphql-typegen extract as Foob
        fragment Foo on Bar {
          baz
        }
      `,
        process.cwd()
      )
      expect(config).to.deep.equal({
        objectType: 'exact',
        useReadOnlyTypes: true,
        extract: 'Foob',
        external: undefined,
        addTypename: undefined,
        ignoreData: undefined,
        ignoreVariables: undefined,
      })
    })
  })
  describe(`objectType and readOnly`, function() {
    it(`defaults`, function() {
      expect(
        getCommentDirectives(
          fragment`
        fragment Foo on Bar {
          baz
        }
      `,
          process.cwd()
        ).objectType
      ).to.be.undefined
      expect(
        getCommentDirectives(
          fragment`
        fragment Foo on Bar {
          baz
        }
      `,
          process.cwd()
        ).useReadOnlyTypes
      ).to.be.undefined
    })
    it(`exact works`, function() {
      expect(
        getCommentDirectives(fragment`
        # @graphql-typegen exact
        fragment Foo on Bar {
          baz
        }
      `).objectType
      ).to.equal('exact')
    })
    it(`inexact works`, function() {
      expect(
        getCommentDirectives(
          fragment`
        # @graphql-typegen inexact
        fragment Foo on Bar {
          baz
        }
      `,
          process.cwd()
        ).objectType
      ).to.equal('inexact')
    })
    it(`ambiguous works`, function() {
      expect(
        getCommentDirectives(
          fragment`
        # @graphql-typegen ambiguous
        fragment Foo on Bar {
          baz
        }
      `,
          process.cwd()
        ).objectType
      ).to.equal('ambiguous')
    })
    it(`throws on duplicate object type`, function() {
      expect(
        () =>
          getCommentDirectives(
            fragment`
        # @graphql-typegen exact
        # @graphql-typegen inexact
        fragment Foo on Bar {
          baz
        }
      `,
            process.cwd()
          ).objectType
      ).to.throw(
        'duplicate object type directive: inexact (after previous exact)'
      )
    })
    it(`readOnly works`, function() {
      expect(
        getCommentDirectives(
          fragment`
        # @graphql-typegen readOnly
        fragment Foo on Bar {
          baz
        }
      `,
          process.cwd()
        ).useReadOnlyTypes
      ).to.be.true
    })
    it(`mutable works`, function() {
      expect(
        getCommentDirectives(
          fragment`
        # @graphql-typegen mutable
        fragment Foo on Bar {
          baz
        }
      `,
          process.cwd()
        ).useReadOnlyTypes
      ).to.be.false
    })
    it(`throws on duplicate readOnly`, function() {
      expect(
        () =>
          getCommentDirectives(
            fragment`
        # @graphql-typegen readOnly
        # @graphql-typegen mutable
        fragment Foo on Bar {
          baz
        }
      `,
            process.cwd()
          ).objectType
      ).to.throw(
        'duplicate readOnly/mutable directive: mutable (after previous readOnly)'
      )
    })
  })
  describe(`external`, function() {
    describe(`on fragment`, function() {
      it(`returns undefined if there's no comment`, function() {
        expect(
          getCommentDirectives(
            fragment`
          fragment Foo on Bar {
            baz
          }
        `,
            process.cwd()
          ).external
        ).to.be.undefined
      })
      it(`returns undefined if no comments are relevant`, function() {
        expect(
          getCommentDirectives(
            fragment`
          # @graphql-typegen inexact
          fragment Foo on Bar {
            baz
          }
        `,
            process.cwd()
          ).external
        ).to.be.undefined
      })
      it(`throws if there's a comment without an as clause`, function() {
        expect(
          () =>
            getCommentDirectives(
              fragment`
          # blah
          # @graphql-typegen external
          fragment Foo on Bar {
            baz
          }
        `,
              process.cwd()
            ).external
        ).to.throw('missing as clause after external')
      })
      it(`returns identifier from as clause if given`, function() {
        expect(
          getCommentDirectives(
            fragment`
          # @graphql-typegen external as Foob
          fragment Foo on Bar {
            baz
          }
        `,
            process.cwd()
          ).external
        ).to.equal('Foob')
      })
      it(`throws if invalid token comes after external`, function() {
        expect(
          () =>
            getCommentDirectives(
              fragment`
          # @graphql-typegen external ass
          fragment Foo on Bar {
            baz
          }
        `,
              process.cwd()
            ).external
        ).to.throw('invalid token after external: ass')
      })
      it(`throws if external as identifier is invalid`, function() {
        expect(
          () =>
            getCommentDirectives(
              fragment`
          # @graphql-typegen external as 0foo
          fragment Foo on Bar {
            baz
          }
        `,
              process.cwd()
            ).external
        ).to.throw('invalid external as identifier: 0foo')
      })
    })
    describe(`on field`, function() {
      it(`returns undefined if there's no comment`, function() {
        expect(getCommentDirectives(field`baz`).external).to.be.undefined
      })
      it(`returns undefined if no comments are relevant`, function() {
        expect(
          getCommentDirectives(
            field`
          # @graphql-typegen readOnly
          baz
        `,
            process.cwd()
          ).external
        ).to.be.undefined
      })
      it(`throws if there's a comment without an as clause`, function() {
        expect(
          () =>
            getCommentDirectives(
              field`
          # blah
          # @graphql-typegen external
          baz
        `,
              process.cwd()
            ).external
        ).to.throw('missing as clause after external')
      })
      it(`throws if not followed by as`, function() {
        expect(
          () =>
            getCommentDirectives(
              field`
          # blah
          # @graphql-typegen external ass
          baz
        `,
              process.cwd()
            ).external
        ).to.throw('invalid token after external: ass')
      })
      it(`returns identifier from as clause if given`, function() {
        expect(
          getCommentDirectives(
            field`
          # @graphql-typegen external as Foob
          baz
        `,
            process.cwd()
          ).external
        ).to.equal('Foob')
      })
      it(`throws if invalid token comes after external`, function() {
        expect(
          () =>
            getCommentDirectives(
              field`
          # @graphql-typegen external ass
          baz
        `,
              process.cwd()
            ).external
        ).to.throw('invalid token after external: ass')
      })
      it(`throws if external as identifier is invalid`, function() {
        expect(
          () =>
            getCommentDirectives(
              field`
          # @graphql-typegen external as 0foo
          baz
        `,
              process.cwd()
            ).external
        ).to.throw('invalid external as identifier: 0foo')
      })
      it(`throws if external identifier is missing`, function() {
        expect(
          () =>
            getCommentDirectives(
              field`
          # @graphql-typegen external as
          baz
        `,
              process.cwd()
            ).external
        ).to.throw('missing identifier after external as')
      })
    })
  })
  describe(`extract`, function() {
    describe(`on fragment`, function() {
      it(`returns undefined if there's no comment`, function() {
        expect(
          getCommentDirectives(
            fragment`
          fragment Foo on Bar {
            baz
          }
        `,
            process.cwd()
          ).extract
        ).to.be.undefined
      })
      it(`returns undefined if no comments are relevant`, function() {
        expect(
          getCommentDirectives(
            fragment`
          # @graphql-typegen inexact
          fragment Foo on Bar {
            baz
          }
        `,
            process.cwd()
          ).extract
        ).to.be.undefined
      })
      it(`returns true if there's a comment without an as clause`, function() {
        expect(
          getCommentDirectives(
            fragment`
          # blah
          # @graphql-typegen extract
          fragment Foo on Bar {
            baz
          }
        `,
            process.cwd()
          ).extract
        ).to.be.true
      })
      it(`returns identifier from as clause if given`, function() {
        expect(
          getCommentDirectives(
            fragment`
          # @graphql-typegen extract as Foob
          fragment Foo on Bar {
            baz
          }
        `,
            process.cwd()
          ).extract
        ).to.equal('Foob')
      })
      it(`throws if invalid token comes after extract`, function() {
        expect(
          () =>
            getCommentDirectives(
              fragment`
          # @graphql-typegen extract ass
          fragment Foo on Bar {
            baz
          }
        `,
              process.cwd()
            ).extract
        ).to.throw('invalid token after extract: ass')
      })
      it(`throws if extract as identifier is invalid`, function() {
        expect(
          () =>
            getCommentDirectives(
              fragment`
          # @graphql-typegen extract as 0foo
          fragment Foo on Bar {
            baz
          }
        `,
              process.cwd()
            ).extract
        ).to.throw('invalid extract as identifier: 0foo')
      })
    })
    describe(`on field`, function() {
      it(`returns undefined if there's no comment`, function() {
        expect(getCommentDirectives(field`baz`, process.cwd()).extract).to.be
          .undefined
      })
      it(`returns undefined if no comments are relevant`, function() {
        expect(
          getCommentDirectives(
            field`
          # @graphql-typegen readOnly
          baz
        `,
            process.cwd()
          ).extract
        ).to.be.undefined
      })
      it(`returns true if there's a comment without an as clause`, function() {
        expect(
          getCommentDirectives(
            field`
          # blah
          # @graphql-typegen extract
          baz
        `,
            process.cwd()
          ).extract
        ).to.be.true
      })
      it(`returns identifier from as clause if given`, function() {
        expect(
          getCommentDirectives(
            field`
          # @graphql-typegen extract as Foob
          baz
        `,
            process.cwd()
          ).extract
        ).to.equal('Foob')
      })
      it(`throws if invalid token comes after extract`, function() {
        expect(
          () =>
            getCommentDirectives(
              field`
          # @graphql-typegen extract ass
          baz
        `,
              process.cwd()
            ).extract
        ).to.throw('invalid token after extract: ass')
      })
      it(`throws if extract as identifier is invalid`, function() {
        expect(
          () =>
            getCommentDirectives(
              field`
          # @graphql-typegen extract as 0foo
          baz
        `,
              process.cwd()
            ).extract
        ).to.throw('invalid extract as identifier: 0foo')
      })
      it(`throws if extract as identifier is missing`, function() {
        expect(
          () =>
            getCommentDirectives(
              field`
          # @graphql-typegen extract as
          baz
        `,
              process.cwd()
            ).extract
        ).to.throw('missing identifier after extract as')
      })
    })
  })
})
