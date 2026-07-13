// Shared config for all tracked matches. Every script takes --event=<key>
// (default: semifinal) and reads/writes data/<key>/{prices,listings}.json.
module.exports = {
  semifinal: {
    key: 'semifinal',
    title: 'England vs Argentina — World Cup Semifinal (Match 102)',
    short: 'SEMI',
    datetime: '2026-07-15T15:00:00-04:00',
    venue: 'Mercedes-Benz Stadium, Atlanta, GA',
    fifaMatchId: '10229226725358',
    sources: {
      tickpick: {
        label: 'TickPick',
        url: 'https://www.tickpick.com/buy-world-cup-26-semi-finals-england-vs-argentina-match-102-tickets-mercedes-benz-stadium-7-15-26-3pm/6259549/',
        feesIncluded: true,
      },
      gametime: {
        label: 'Gametime',
        url: 'https://gametime.co/fifa/fifa-world-cup-match-102-semi-final-tickets/7-15-2026-atlanta-ga-mercedes-benz-stadium/events/66a7e8a5218fbd1123388be7',
        feesIncluded: true, // tracked as cheapest listing all-in (from listings.json)
      },
      vividseats: {
        label: 'Vivid Seats',
        url: 'https://www.vividseats.com/world-cup-soccer-tickets-mercedes-benz-stadium-7-15-2026--sports-soccer/production/5080871',
        feesIncluded: true,
        manual: true, // blocks scripted fetches; injected via --add
      },
      seatgeek: {
        label: 'SeatGeek',
        url: 'https://seatgeek.com/fifa-world-cup-tickets/international-soccer/2026-07-15-3-pm/17174347?sort=lowest_price',
        feesIncluded: false,
        manual: true,
      },
      fifaresale: {
        label: 'FIFA Resale',
        url: 'https://thegreatreviewer.com/wc-tracker/',
        feesIncluded: true,
        api: true, // thegreatreviewer.com dashboard API (crowdsourced FIFA marketplace scans)
      },
    },
  },
  final: {
    key: 'final',
    title: 'World Cup Final (Match 104)',
    short: 'FINAL',
    datetime: '2026-07-19T15:00:00-04:00',
    venue: 'MetLife Stadium, East Rutherford, NJ',
    fifaMatchId: '10229226725360',
    sources: {
      tickpick: {
        label: 'TickPick',
        url: 'https://www.tickpick.com/buy-world-cup-26-final-match-104-tickets-metlife-stadium-7-19-26-3pm/6250040/',
        feesIncluded: true,
      },
      gametime: {
        label: 'Gametime',
        url: 'https://gametime.co/fifa/fifa-world-cup-w101-vs-w102-match-104-final-tickets/7-19-2026-east-rutherford-nj-met-life-stadium/events/66ac2fe6b082f2f98b480923',
        feesIncluded: true,
      },
      vividseats: {
        label: 'Vivid Seats',
        url: 'https://www.vividseats.com/world-cup-soccer-tickets-hard-rock-stadium-7-19-2026--sports-soccer/production/5080877',
        feesIncluded: true,
        manual: true,
      },
      seatgeek: {
        label: 'SeatGeek',
        url: 'https://seatgeek.com/fifa-world-cup-tickets/international-soccer/2026-07-19-3-pm/17307574?sort=lowest_price',
        feesIncluded: false,
        manual: true,
      },
      fifaresale: {
        label: 'FIFA Resale',
        url: 'https://thegreatreviewer.com/wc-tracker/',
        feesIncluded: true,
        api: true,
      },
    },
  },
};
