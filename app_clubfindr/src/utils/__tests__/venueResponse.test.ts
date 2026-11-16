import { MalformedVenueResponse, venueList } from '../venueResponse';

describe('venueList', () => {
  it('passes a list through, an empty one included', () => {
    const venues = [{ id: 'v1', name: 'Fabric' }];
    expect(venueList(venues, 'club')).toBe(venues);
    expect(venueList([], 'bar')).toEqual([]);
  });

  // TilkiScreen read `response.data || []`, so these showed "nothing found"
  it.each([null, undefined, {}, { success: true }, 'ok', 0])(
    'refuses %p as malformed',
    (data) => {
      expect(() => venueList(data, 'bar')).toThrow(MalformedVenueResponse);
    }
  );
});
