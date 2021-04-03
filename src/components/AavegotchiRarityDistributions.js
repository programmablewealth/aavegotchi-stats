import React, { Component } from 'react';

import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';

import { DataGrid } from '@material-ui/data-grid';

import { retrieveAllGotchis } from '../util/Graph';

import Loading from './Loading';

const _ = require('lodash');
const axios = require('axios');

class AavegotchiRarityDistributions extends Component {
  constructor(props) {
    super(props);

    this.renderRarityDistribution = this.renderRarityDistribution.bind(this);

    document.title = this.props.title;

    this.state = {
      gotchisByBRS: [],
      aavegotchis: {},
      minBrs: 0, maxBrs: 0,
      loading: true,
    };
  }

  async componentDidMount() {
    retrieveAllGotchis()
      .then((gotchis) => {
        console.log(gotchis);

        let aavegotchis = {};
        let minBrs = 0;
        let maxBrs = 0;

        for (var a = 0; a < gotchis.length; a++) {
          let brs = parseInt(gotchis[a].baseRarityScore)

          aavegotchis[gotchis[a].id] = gotchis[a];
          aavegotchis[gotchis[a].id].brs = brs;
        }

        Object.keys(aavegotchis).map(function(id, index) {
          let aavegotchi = aavegotchis[id];

          if (index == 0) {
            minBrs = aavegotchi.brs;
            maxBrs = aavegotchi.brs;
          } else if (aavegotchi.brs < minBrs) {
            minBrs = aavegotchi.brs;
          } else if (aavegotchi.brs > maxBrs) {
            maxBrs = aavegotchi.brs;
          }
        });

        this.setState({ aavegotchis: aavegotchis, summonedGotchis: Object.keys(aavegotchis).length, minBrs, maxBrs, loading: false });
      });
  }

  calculateData() {
    let data = [];
    for (let brs = this.state.minBrs; brs < this.state.maxBrs+1; brs++) {
      let filteredAavegotchis = _.filter(this.state.aavegotchis, ['brs', brs]);
      let countBrs = filteredAavegotchis.length;
      // console.log(this.state.aavegotchis, brs, filteredAavegotchis, countBrs);
      data.push([brs, countBrs]);
    }
    return data;
  }

  async retrieveListings(tokenIds) {
    console.log('retrieveListings', tokenIds);

    let tokenIdString = "";
    tokenIds.map(function(value, index) {
      tokenIdString += "\"" + value + "\","
    });

    const query = `{
      erc721Listings(first: 1000, where: { tokenId_in: [${tokenIdString}], cancelled: false, timePurchased: "0" }) {
        id
        tokenId
        priceInWei
      }
    }`;

    console.log('query', query);

    const listings = await axios.post(
      'https://api.thegraph.com/subgraphs/name/aavegotchi/aavegotchi-core-matic',
      {
        query: query
      }
    );

    this.setState({erc721Listings: listings.data.data.erc721Listings});
    console.log(listings.data.data.erc721Listings);
  }

  async retrieveGotchis(brsValue) {
    console.log('retrieveGotchis', 'brsValue', brsValue);
    const gotchisByBRS = _.filter(this.state.aavegotchis, ['baseRarityScore', brsValue.toString()]);
    console.log(gotchisByBRS);
    this.setState({ gotchisByBRS: gotchisByBRS, brsValue: brsValue });

    let tokenIds = [];
    gotchisByBRS.map(function(a, index) {
      tokenIds.push(a.id);
    });
    this.retrieveListings(tokenIds);
  }

  renderGotchis() {
    const _this = this;
    if (this.state.gotchisByBRS.length > 0) {
      const columns = [
        { field: 'id', headerName: 'ID', width: 80 },
        { field: 'name', headerName: 'Name', width: 220 },
        { field: 'brs', headerName: 'BRS', width: 80 },
        { field: 'mrs', headerName: 'MRS', width: 85 },
        {
          field: 'listing',
          headerName: 'Listing',
          width: 110,
          renderCell: (params: GridCellParams) => (
            params.value.link && params.value.text && (
              <a href={(params.value.link)} target="_blank">
                {(params.value.text)}
              </a>
            )
          )
        },
        { field: 'nrg', headerName: 'Energy', width: 100 },
        { field: 'agg', headerName: 'Aggression', width: 130 },
        { field: 'spk', headerName: 'Spookiness', width: 130 },
        { field: 'brn', headerName: 'Brain Size', width: 120 },
        { field: 'eyeShape', headerName: 'Eye Shape', width: 120 },
        { field: 'eyeColor', headerName: 'Eye Color', width: 120 },
      ];

      let rows = [];
      _this.state.gotchisByBRS.map(function(a, index) {
        let row = {
          id: a.id,
          name: a.name,
          nrg: a.numericTraits[0],
          agg: a.numericTraits[1],
          spk: a.numericTraits[2],
          brn: a.numericTraits[3],
          eyeShape: a.numericTraits[4],
          eyeColor: a.numericTraits[5],
          brs: a.baseRarityScore,
          mrs: a.modifiedRarityScore,
        };

        const listing = _.filter(_this.state.erc721Listings, ['tokenId', a.id]);
        console.log('filtered', listing);
        if (listing.length > 0) {
          row.listing = {
            link: `https://aavegotchi.com/baazaar/erc721/${listing[0].id}`,
            text: `${Math.round(listing[0].priceInWei / 1000000000000000000)}`,
          };
        } else {
          row.listing = {
            link: 'https://aavegotchi.com/baazaar/aavegotchis',
            text: 'None',
          };
        }

        rows.push(row);
      });

      return (
        <div>
          <h2>Aavegotchis with a Base Rarity Score of {this.state.brsValue}</h2>
          <p>Count: {rows.length}</p>
          <div style={{ height: '1080px', width: '100%' }}>
            <DataGrid rows={rows} columns={columns} pageSize={100} density="compact" />
          </div>
        </div>
      );
    }
  }

  renderRarityDistribution() {
    const _this = this;

    if (Object.keys(this.state.aavegotchis).length > 0) {
      const options = {
        title: {
          text: 'Summoned Aavegotchis Base Rarity Score Distribution',
        },
        subtitle: {
          text: `${this.state.summonedGotchis} Summoned Gotchis`
        },
        series: [
          { data: this.calculateData(), name: 'BRS' },
        ],
        plotOptions: {
          series: {
            allowPointSelect: true,
            point: {
              events: {
                click: function () {
                  _this.retrieveGotchis(this.x);
                }
              }
            }
          }
        },
        xAxis: {
          title: {
            text: 'Base Trait Value'
          }
        },
        yAxis: {
          title: {
            text: 'Gotchi Count'
          }
        },
        tooltip: {
          pointFormat: 'BRS of {point.x}: <b>{point.y}</b><br/>',
          valueSuffix: ' Gotchis',
          shared: false
        },
        credits: {
          enabled: true,
          href: 'https://aavegotchistats.com/rarity',
          text: 'aavegotchistats.com/rarity'
        }
      }

      return (
        <HighchartsReact
          highcharts={Highcharts}
          options={options}
        />
      );
    }
  }

  render() {
    return (
      <div>
        <h1>Aavegotchi Rarity Distribution</h1>
        {this.state.loading &&
          <Loading message="Loading Aavegotchis from TheGraph..." />
        }
        {this.renderRarityDistribution()}
        {this.renderGotchis()}
      </div>
    );
  }
}

export default AavegotchiRarityDistributions;