import { describe, it, expect } from 'vitest'
import { interpretStroke } from '../src/pages/admin/ScoreEntry.jsx'

describe('score entry digit handling', () => {
  it('accepts single digits and moves on when no second digit could follow', () => {
    expect(interpretStroke('4', 15)).toEqual({ text: '4', value: 4, valid: true, done: true })
    expect(interpretStroke('2', 15)).toMatchObject({ value: 2, done: true })
  })

  it('waits after "1" because 10–15 are still possible', () => {
    expect(interpretStroke('1', 15)).toMatchObject({ value: 1, valid: true, done: false })
    expect(interpretStroke('12', 15)).toMatchObject({ value: 12, valid: true, done: true })
  })

  it('rejects zero and values above the limit', () => {
    expect(interpretStroke('0', 15)).toMatchObject({ value: null, valid: false })
    expect(interpretStroke('16', 15)).toMatchObject({ value: null, valid: false })
  })

  it('treats an empty cell as a cleared score', () => {
    expect(interpretStroke('', 15)).toEqual({ text: '', value: null, valid: true, done: false })
  })

  it('strips non-digits and keeps at most two digits', () => {
    expect(interpretStroke('a3', 15)).toMatchObject({ text: '3', value: 3 })
    expect(interpretStroke('123', 99)).toMatchObject({ text: '12', value: 12 })
  })

  it('follows a higher limit', () => {
    expect(interpretStroke('2', 30)).toMatchObject({ value: 2, done: false })
    expect(interpretStroke('25', 30)).toMatchObject({ value: 25, done: true })
  })
})
