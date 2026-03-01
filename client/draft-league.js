document.addEventListener('DOMContentLoaded', function() {
  // Update the time
  function updateTime() {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');

      document.getElementById('ceefax-time').textContent = `${hours}:${minutes}:${seconds}`;
  }

  // Update time immediately and then every second
  updateTime();
  setInterval(updateTime, 1000);

  // Store chart instance globally
  let positionChart = null;

  // Colors for the chart lines
  const chartColors = [
      '#ffff00', // yellow
      '#00ffff', // cyan
      '#ff00ff', // magenta
      '#00ff00', // green
      '#ff0000', // red
      '#ffffff', // white
      '#aaaaff', // light blue
      '#ffaa00', // orange
      '#00ffaa', // aqua
      '#ff00aa', // pink
      '#aaff00', // lime
      '#aa00ff'  // purple
  ];

  // Fetch draft league data
  async function fetchDraftLeague() {
      const leagueId = 44363; // Your specified league ID
      const url = `https://cors-anywhere.herokuapp.com/https://draft.premierleague.com/api/league/${leagueId}/details`;


      try {
          const response = await fetch(url);

          if (!response.ok) {
              throw new Error(`API request failed with status ${response.status}`);
          }

          const data = await response.json();
          console.log("Draft league data:", data);

          // Display the league data
          displayLeagueStandings(data);

          // Create/update the position chart
          createPositionChart(data);

          // Update the league name if available
          if (data.league && data.league.name) {
              document.getElementById('draft-title').textContent = data.league.name.toUpperCase();
          }

          // Update the last updated time
          const now = new Date();
          document.querySelector('.ceefax-update').textContent =
              `LAST UPDATED: ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      } catch (error) {
          console.error('Error fetching draft league data:', error);
          document.querySelector('.ceefax-draft-content').innerHTML =
              '<div class="ceefax-error">ERROR RETRIEVING LEAGUE DATA</div>';
      }
  }

  // Display league standings
  function displayLeagueStandings(data) {
      const contentContainer = document.querySelector('.ceefax-draft-content');
      contentContainer.innerHTML = ''; // Clear loading message

      if (!data || !data.league_entries || !data.standings) {
          contentContainer.innerHTML = '<div class="ceefax-error">INVALID LEAGUE DATA</div>';
          return;
      }

      // Create a map of team entries
      const teamMap = {};
      data.league_entries.forEach(entry => {
          teamMap[entry.id] = entry;
      });

      // Add league header
      const leagueHeader = document.createElement('div');
      leagueHeader.className = 'ceefax-draft-header';
      leagueHeader.textContent = `GAMEWEEK ${data.standings[0]?.event || '?'}`;
      contentContainer.appendChild(leagueHeader);

      // Add standings table header
      const tableHeader = document.createElement('div');
      tableHeader.className = 'ceefax-draft-table-header';
      tableHeader.innerHTML = `
          <span class="ceefax-draft-pos">POS</span>
          <span class="ceefax-draft-team-name">TEAM</span>
          <span class="ceefax-draft-played">PL</span>
          <span class="ceefax-draft-points">PTS</span>
      `;
      contentContainer.appendChild(tableHeader);

      // Add teams
      data.standings.forEach(standing => {
          const teamEntry = teamMap[standing.league_entry];
          if (!teamEntry) return; // Skip if team entry not found

          const teamElement = document.createElement('div');
          teamElement.className = 'ceefax-draft-team';

          const teamName = teamEntry.entry_name.toUpperCase();
          const playerName = teamEntry.player_first_name.charAt(0) + '. ' + teamEntry.player_last_name.toUpperCase();

          teamElement.innerHTML = `
              <span class="ceefax-draft-pos">${standing.rank}</span>
              <span class="ceefax-draft-team-name" title="${playerName}">${teamName}</span>
              <span class="ceefax-draft-played">${standing.matches_played}</span>
              <span class="ceefax-draft-points">${standing.total}</span>
          `;

          contentContainer.appendChild(teamElement);
      });
  }

  // Create position chart
  function createPositionChart(data) {
      if (!data || !data.matches || !data.league_entries) return;

      // Process match data to extract position history
      const gameweeks = {};
      const teams = {};

      // Initialize team data
      data.league_entries.forEach(entry => {
          teams[entry.id] = {
              name: entry.entry_name,
              positions: {}
          };
      });

      // Process matches to determine standings after each gameweek
      data.matches.forEach(match => {
          const gameweek = match.event;
          if (!gameweeks[gameweek]) {
              gameweeks[gameweek] = {
                  teams: data.league_entries.map(entry => ({
                      id: entry.id,
                      name: entry.entry_name,
                      points: 0,
                      played: 0
                  }))
              };
          }

          // Only count completed matches
          if (match.finished) {
              // Update team points for this gameweek
              const homeTeam = gameweeks[gameweek].teams.find(t => t.id === match.league_entry_1);
              const awayTeam = gameweeks[gameweek].teams.find(t => t.id === match.league_entry_2);

              if (homeTeam) {
                  homeTeam.played++;
                  homeTeam.points += match.league_entry_1_points;
              }

              if (awayTeam) {
                  awayTeam.played++;
                  awayTeam.points += match.league_entry_2_points;
              }
          }
      });

      // Calculate standings for each gameweek
      const gameweekNumbers = Object.keys(gameweeks).sort((a, b) => parseInt(a) - parseInt(b));
      const cumulativePoints = {};

      // Initialize cumulative points
      data.league_entries.forEach(entry => {
          cumulativePoints[entry.id] = 0;
      });

      gameweekNumbers.forEach(gw => {
          const teamsInGw = gameweeks[gw].teams;

          // Update cumulative points
          teamsInGw.forEach(team => {
              cumulativePoints[team.id] += team.points;
              team.totalPoints = cumulativePoints[team.id];
          });

          // Sort teams by total points to determine position
          const sortedTeams = [...teamsInGw].sort((a, b) => {
              if (b.totalPoints !== a.totalPoints) {
                  return b.totalPoints - a.totalPoints;
              }
              return 0; // Tiebreaker could be added here
          });

          // Assign positions
          sortedTeams.forEach((team, index) => {
              if (teams[team.id]) {
                  teams[team.id].positions[gw] = index + 1;
              }
          });
      });

      // Prepare chart data
      const labels = gameweekNumbers;
      const datasets = Object.values(teams).map((team, index) => {
          const positionData = gameweekNumbers.map(gw => {
              // Position is 0-indexed in code but should be 1-indexed for display
              // Also invert the y-axis so that position 1 is at the top
              return team.positions[gw] || null;
          });

          return {
              label: team.name,
              data: positionData,
              borderColor: chartColors[index % chartColors.length],
              backgroundColor: 'transparent',
              tension: 0.1,
              pointRadius: 4,
              pointHoverRadius: 6
          };
      });

      // Get the canvas element
      const ctx = document.getElementById('positionChart').getContext('2d');

      // Destroy existing chart if it exists
      if (positionChart) {
          positionChart.destroy();
      }

      // Create the chart
      positionChart = new Chart(ctx, {
          type: 'line',
          data: {
              labels: labels,
              datasets: datasets
          },
          options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                  y: {
                      reverse: true, // Reverse Y axis so position 1 is at the top
                      min: 1,
                      max: data.league_entries.length,
                      ticks: {
                          stepSize: 1,
                          color: '#ffffff'
                      },
                      grid: {
                          color: '#333333'
                      }
                  },
                  x: {
                      title: {
                          display: true,
                          text: 'Gameweek',
                          color: '#ffffff'
                      },
                      ticks: {
                          color: '#ffffff'
                      },
                      grid: {
                          color: '#333333'
                      }
                  }
              },
              plugins: {
                  legend: {
                      display: true,
                      labels: {
                          color: '#ffffff',
                          font: {
                              family: "'Courier New', monospace"
                          }
                      }
                  },
                  title: {
                      display: true,
                      text: 'TEAM POSITION BY GAMEWEEK',
                      color: '#ffff00',
                      font: {
                          family: "'Courier New', monospace",
                          size: 16
                      }
                  }
              }
          }
      });
  }

  // Initial data fetch
  fetchDraftLeague();

  // Refresh data every 30 minutes
  setInterval(fetchDraftLeague, 30 * 60 * 1000);
});
