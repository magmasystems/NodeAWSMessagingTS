import * as assert from 'assert';
import * as chai from 'chai';
const expect = chai.expect;

describe('Array', () =>
{
  describe('#indexOf()', () =>
  {
    it ('should return -1 when the value is not present', () =>
    {
      assert.equal(-1, [1, 2, 3].indexOf(4));

      const idx = [1, 2, 3].indexOf(4);
      expect(idx).to.equal(-1, "Idx should be -1");
    });

    it ('should return 0 or positive integer when the value is present', () =>
    {
      assert.equal(2, [1, 2, 3].indexOf(3));
    });
  });
});
