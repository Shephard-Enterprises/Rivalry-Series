export const players = [
  ['Josh Allen', 'QB', 'BUF', 'vs BAL', 24.1, 'Healthy'], ['Lamar Jackson', 'QB', 'BAL', '@ BUF', 23.4, 'Healthy'],
  ['Jalen Hurts', 'QB', 'PHI', 'vs DAL', 22.8, 'Questionable'], ['Joe Burrow', 'QB', 'CIN', '@ CLE', 21.9, 'Healthy'],
  ['Bijan Robinson', 'RB', 'ATL', 'vs TB', 19.8, 'Healthy'], ['Saquon Barkley', 'RB', 'PHI', 'vs DAL', 19.2, 'Healthy'],
  ['Jahmyr Gibbs', 'RB', 'DET', '@ GB', 18.7, 'Healthy'], ['Christian McCaffrey', 'RB', 'SF', 'vs SEA', 18.2, 'Questionable'],
  ['Breece Hall', 'RB', 'NYJ', 'vs NE', 17.4, 'Healthy'], ['Derrick Henry', 'RB', 'BAL', '@ BUF', 16.9, 'Healthy'],
  ['James Cook', 'RB', 'BUF', 'vs BAL', 16.3, 'Doubtful'], ['CeeDee Lamb', 'WR', 'DAL', '@ PHI', 19.5, 'Healthy'],
  ['Ja’Marr Chase', 'WR', 'CIN', '@ CLE', 19.1, 'Healthy'], ['Justin Jefferson', 'WR', 'MIN', 'vs CHI', 18.8, 'Healthy'],
  ['Amon-Ra St. Brown', 'WR', 'DET', '@ GB', 18.1, 'Questionable'], ['Puka Nacua', 'WR', 'LAR', 'vs ARI', 17.6, 'Healthy'],
  ['A.J. Brown', 'WR', 'PHI', 'vs DAL', 17.2, 'Healthy'], ['Nico Collins', 'WR', 'HOU', 'vs IND', 16.7, 'Healthy'],
  ['Brock Bowers', 'TE', 'LV', '@ DEN', 14.7, 'Healthy'], ['Trey McBride', 'TE', 'ARI', '@ LAR', 14.1, 'Healthy'],
  ['George Kittle', 'TE', 'SF', 'vs SEA', 13.6, 'Questionable'], ['Sam LaPorta', 'TE', 'DET', '@ GB', 12.8, 'Healthy'],
].map(([name, position, team, opponent, projection, status], index) => ({ id: index + 1, name, position, team, opponent, projection, status }))

export const positions = ['ALL', 'QB', 'RB', 'WR', 'TE']
export const managers = ['Justin', 'Luke']
export const rosterLimits = { QB: 1, RB: 2, WR: 2, TE: 1 }
