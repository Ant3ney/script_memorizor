import {defineField, defineType} from 'sanity'

export const scriptSave = defineType({
  name: 'scriptSave',
  title: 'Script Save',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (rule) => rule.required().max(120),
    }),
    defineField({
      name: 'text',
      title: 'Script Text',
      type: 'text',
      rows: 18,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'localId',
      title: 'App Save ID',
      type: 'string',
      readOnly: true,
      description: 'Stable ID used by the Script Memorizor browser app.',
    }),
    defineField({
      name: 'hiddenCount',
      title: 'Hidden Count',
      type: 'number',
      initialValue: 0,
      validation: (rule) => rule.integer().min(0),
    }),
    defineField({
      name: 'wordCount',
      title: 'Word Count',
      type: 'number',
      readOnly: true,
      validation: (rule) => rule.integer().min(0),
    }),
    defineField({
      name: 'hideOrder',
      title: 'Hide Order',
      type: 'array',
      of: [{type: 'number'}],
      description: 'The app creates this automatically when it imports or pulls a script.',
      options: {
        sortable: false,
      },
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
    }),
    defineField({
      name: 'updatedAt',
      title: 'Updated At',
      type: 'datetime',
    }),
  ],
  orderings: [
    {
      title: 'Last updated',
      name: 'updatedAtDesc',
      by: [{field: 'updatedAt', direction: 'desc'}],
    },
  ],
  preview: {
    select: {
      title: 'title',
      hiddenCount: 'hiddenCount',
      wordCount: 'wordCount',
      updatedAt: 'updatedAt',
    },
    prepare({title, hiddenCount, wordCount, updatedAt}) {
      const progress =
        typeof hiddenCount === 'number' && typeof wordCount === 'number'
          ? `${hiddenCount}/${wordCount} hidden`
          : 'No progress'

      return {
        title,
        subtitle: updatedAt ? `${progress} | ${new Date(updatedAt).toLocaleString()}` : progress,
      }
    },
  },
})
