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
        getCommentDirectives(fragment`
        # @graphql-to-flow readOnly blah
        fragment Foo on Bar {
          baz
        }
      `).objectType
    ).to.throw('invalid directive: blah')
  })
  describe(`multiple directives`, function() {
    it(`works`, function() {
      const config = getCommentDirectives(fragment`
        # @graphql-to-flow readOnly exact
        # @graphql-to-flow extract as Foob
        fragment Foo on Bar {
          baz
        }
      `)
      expect(config).to.deep.equal({
        objectType: 'exact',
        useReadOnlyTypes: true,
        extract: 'Foob',
        external: undefined,
        addTypename: undefined,
      })
    })
  })
  describe(`objectType and readOnly`, function() {
    it(`defaults`, function() {
      expect(
        getCommentDirectives(fragment`
        fragment Foo on Bar {
          baz
        }
      `).objectType
      ).to.be.undefined
      expect(
        getCommentDirectives(fragment`
        fragment Foo on Bar {
          baz
        }
      `).useReadOnlyTypes
      ).to.be.undefined
    })
    it(`exact works`, function() {
      expect(
        getCommentDirectives(fragment`
        # @graphql-to-flow exact
        fragment Foo on Bar {
          baz
        }
      `).objectType
      ).to.equal('exact')
    })
    it(`inexact works`, function() {
      expect(
        getCommentDirectives(fragment`
        # @graphql-to-flow inexact
        fragment Foo on Bar {
          baz
        }
      `).objectType
      ).to.equal('inexact')
    })
    it(`ambiguous works`, function() {
      expect(
        getCommentDirectives(fragment`
        # @graphql-to-flow ambiguous
        fragment Foo on Bar {
          baz
        }
      `).objectType
      ).to.equal('ambiguous')
    })
    it(`throws on duplicate object type`, function() {
      expect(
        () =>
          getCommentDirectives(fragment`
        # @graphql-to-flow exact
        # @graphql-to-flow inexact
        fragment Foo on Bar {
          baz
        }
      `).objectType
      ).to.throw(
        'duplicate object type directive: inexact (after previous exact)'
      )
    })
    it(`readOnly works`, function() {
      expect(
        getCommentDirectives(fragment`
        # @graphql-to-flow readOnly
        fragment Foo on Bar {
          baz
        }
      `).useReadOnlyTypes
      ).to.be.true
    })
    it(`mutable works`, function() {
      expect(
        getCommentDirectives(fragment`
        # @graphql-to-flow mutable
        fragment Foo on Bar {
          baz
        }
      `).useReadOnlyTypes
      ).to.be.false
    })
    it(`throws on duplicate readOnly`, function() {
      expect(
        () =>
          getCommentDirectives(fragment`
        # @graphql-to-flow readOnly
        # @graphql-to-flow mutable
        fragment Foo on Bar {
          baz
        }
      `).objectType
      ).to.throw(
        'duplicate readOnly/mutable directive: mutable (after previous readOnly)'
      )
    })
  })
  describe(`external`, function() {
    describe(`on fragment`, function() {
      it(`returns undefined if there's no comment`, function() {
        expect(
          getCommentDirectives(fragment`
          fragment Foo on Bar {
            baz
          }
        `).external
        ).to.be.undefined
      })
      it(`returns undefined if no comments are relevant`, function() {
        expect(
          getCommentDirectives(fragment`
          # @graphql-to-flow inexact
          fragment Foo on Bar {
            baz
          }
        `).external
        ).to.be.undefined
      })
      it(`throws if there's a comment without an as clause`, function() {
        expect(
          () =>
            getCommentDirectives(fragment`
          # blah
          # @graphql-to-flow external
          fragment Foo on Bar {
            baz
          }
        `).external
        ).to.throw('missing as clause after external')
      })
      it(`returns identifier from as clause if given`, function() {
        expect(
          getCommentDirectives(fragment`
          # @graphql-to-flow external as Foob
          fragment Foo on Bar {
            baz
          }
        `).external
        ).to.equal('Foob')
      })
      it(`throws if invalid token comes after external`, function() {
        expect(
          () =>
            getCommentDirectives(fragment`
          # @graphql-to-flow external ass
          fragment Foo on Bar {
            baz
          }
        `).external
        ).to.throw('invalid token after external: ass')
      })
      it(`throws if external as identifier is invalid`, function() {
        expect(
          () =>
            getCommentDirectives(fragment`
          # @graphql-to-flow external as 0foo
          fragment Foo on Bar {
            baz
          }
        `).external
        ).to.throw('invalid external as identifier: 0foo')
      })
    })
    describe(`on field`, function() {
      it(`returns undefined if there's no comment`, function() {
        expect(getCommentDirectives(field`baz`).external).to.be.undefined
      })
      it(`returns undefined if no comments are relevant`, function() {
        expect(
          getCommentDirectives(field`
          # @graphql-to-flow readOnly
          baz
        `).external
        ).to.be.undefined
      })
      it(`throws if there's a comment without an as clause`, function() {
        expect(
          () =>
            getCommentDirectives(field`
          # blah
          # @graphql-to-flow external
          baz
        `).external
        ).to.throw('missing as clause after external')
      })
      it(`throws if not followed by as`, function() {
        expect(
          () =>
            getCommentDirectives(field`
          # blah
          # @graphql-to-flow external ass
          baz
        `).external
        ).to.throw('invalid token after external: ass')
      })
      it(`returns identifier from as clause if given`, function() {
        expect(
          getCommentDirectives(field`
          # @graphql-to-flow external as Foob
          baz
        `).external
        ).to.equal('Foob')
      })
      it(`throws if invalid token comes after external`, function() {
        expect(
          () =>
            getCommentDirectives(field`
          # @graphql-to-flow external ass
          baz
        `).external
        ).to.throw('invalid token after external: ass')
      })
      it(`throws if external as identifier is invalid`, function() {
        expect(
          () =>
            getCommentDirectives(field`
          # @graphql-to-flow external as 0foo
          baz
        `).external
        ).to.throw('invalid external as identifier: 0foo')
      })
      it(`throws if external identifier is missing`, function() {
        expect(
          () =>
            getCommentDirectives(field`
          # @graphql-to-flow external as
          baz
        `).external
        ).to.throw('missing identifier after external as')
      })
    })
  })
  describe(`extract`, function() {
    describe(`on fragment`, function() {
      it(`returns undefined if there's no comment`, function() {
        expect(
          getCommentDirectives(fragment`
          fragment Foo on Bar {
            baz
          }
        `).extract
        ).to.be.undefined
      })
      it(`returns undefined if no comments are relevant`, function() {
        expect(
          getCommentDirectives(fragment`
          # @graphql-to-flow inexact
          fragment Foo on Bar {
            baz
          }
        `).extract
        ).to.be.undefined
      })
      it(`returns true if there's a comment without an as clause`, function() {
        expect(
          getCommentDirectives(fragment`
          # blah
          # @graphql-to-flow extract
          fragment Foo on Bar {
            baz
          }
        `).extract
        ).to.be.true
      })
      it(`returns identifier from as clause if given`, function() {
        expect(
          getCommentDirectives(fragment`
          # @graphql-to-flow extract as Foob
          fragment Foo on Bar {
            baz
          }
        `).extract
        ).to.equal('Foob')
      })
      it(`throws if invalid token comes after extract`, function() {
        expect(
          () =>
            getCommentDirectives(fragment`
          # @graphql-to-flow extract ass
          fragment Foo on Bar {
            baz
          }
        `).extract
        ).to.throw('invalid token after extract: ass')
      })
      it(`throws if extract as identifier is invalid`, function() {
        expect(
          () =>
            getCommentDirectives(fragment`
          # @graphql-to-flow extract as 0foo
          fragment Foo on Bar {
            baz
          }
        `).extract
        ).to.throw('invalid extract as identifier: 0foo')
      })
    })
    describe(`on field`, function() {
      it(`returns undefined if there's no comment`, function() {
        expect(getCommentDirectives(field`baz`).extract).to.be.undefined
      })
      it(`returns undefined if no comments are relevant`, function() {
        expect(
          getCommentDirectives(field`
          # @graphql-to-flow readOnly
          baz
        `).extract
        ).to.be.undefined
      })
      it(`returns true if there's a comment without an as clause`, function() {
        expect(
          getCommentDirectives(field`
          # blah
          # @graphql-to-flow extract
          baz
        `).extract
        ).to.be.true
      })
      it(`returns identifier from as clause if given`, function() {
        expect(
          getCommentDirectives(field`
          # @graphql-to-flow extract as Foob
          baz
        `).extract
        ).to.equal('Foob')
      })
      it(`throws if invalid token comes after extract`, function() {
        expect(
          () =>
            getCommentDirectives(field`
          # @graphql-to-flow extract ass
          baz
        `).extract
        ).to.throw('invalid token after extract: ass')
      })
      it(`throws if extract as identifier is invalid`, function() {
        expect(
          () =>
            getCommentDirectives(field`
          # @graphql-to-flow extract as 0foo
          baz
        `).extract
        ).to.throw('invalid extract as identifier: 0foo')
      })
      it(`throws if extract as identifier is missing`, function() {
        expect(
          () =>
            getCommentDirectives(field`
          # @graphql-to-flow extract as
          baz
        `).extract
        ).to.throw('missing identifier after extract as')
      })
    })
  })
})
