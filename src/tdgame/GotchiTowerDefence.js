import React, { Component } from 'react';
import Phaser from 'phaser';
import { IonPhaser } from '@ion-phaser/react';

import { LoadScene } from './scenes/LoadScene';
import { MenuScene } from './scenes/MenuScene';
import { GameplayScene } from './scenes/GameplayScene';
import { GameOverScene } from './scenes/GameOverScene';
import { UIScene } from './scenes/UIScene';
import { PausedScene } from './scenes/PausedScene';

import aavegotchiContractAbi from '../abi/diamond.json';
import contract from '../config/aavegotchiContract.json';
import { connectToMatic } from '../util/MaticClient';

import { retrieveUserAssets, retrieveAllGotchis } from '../util/Graph';

import _ from 'lodash';
import { RateLimit } from 'async-sema';

class GotchiTowerDefence extends Component {
  constructor(props) {
    super(props);

    document.title = this.props.title;

    this.state = {
      address: '',

      myGotchis: [],
      myEnemies: [],
      svgsToGet: [],

      initialize: true,
    }
  }

  async componentDidMount() {
    const _this = this;

    const maticPOSClient = await connectToMatic();
    const aavegotchiContract = await new maticPOSClient.web3Client.web3.eth.Contract(aavegotchiContractAbi, contract.address);
    console.log(aavegotchiContract);

    await window.ethereum.enable();
    console.log('selectedAddress', window.ethereum.selectedAddress);

    this.setState({ address: window.ethereum.selectedAddress })

    if (window.ethereum.selectedAddress != '') {
      retrieveAllGotchis()
        .then((allGotchis) => {
          retrieveUserAssets(window.ethereum.selectedAddress)
            .then((user) => {
              console.log('retrieveAllGotchis', allGotchis);
              let myEnemies = _.reject(allGotchis, function(g) { return g.owner.id == _this.state.address.toLowerCase() });
              myEnemies.map(function(e, i) {
                myEnemies[i].modifiedRarityScore = parseInt(e.modifiedRarityScore);
              })
              myEnemies = _.orderBy(myEnemies, ['modifiedRarityScore', 'asc']);

              console.log('myEnemies', myEnemies);

              console.log('retrieveUserAssets', user);

              _this.setState(
                { user, svgsToGet: myEnemies },
                () => {
                  myEnemies.map(function(enemy, index) {
                    if (index <= 3) { //50) {
                      aavegotchiContract.methods.getAavegotchiSvg(enemy.id).call().then(function (svg) {
                        let svgsToGet = [..._this.state.svgsToGet];
                        svgsToGet = _.remove(svgsToGet, function(g) {
                          return g.id != enemy.id;
                        });
                        _this.setState(
                          {
                            myEnemies: [..._this.state.myEnemies, { tokenId: enemy.id, svg: svg, gotchi: enemy }],
                            svgsToGet: svgsToGet
                          }
                        );
                      }).catch(function (error) {
                        console.log(error);
                      });
                    }
                  });
                }
              );

              _this.retrieveGotchiSvgs(user, aavegotchiContract);
            });
        });

    } else {
      alert('Select the connect button and reload the page');
    }
  }

  async retrieveGotchiSvgs(user, aavegotchiContract) {
    const _this = this;

    const limit = RateLimit(15);

    for (let i = 0; i < user.gotchisOwned.length; i++) {
      let gotchi = user.gotchisOwned[i];
      let tokenId = gotchi.id;
      await limit();
      _this.fetchFromRPC(aavegotchiContract, tokenId, gotchi, user);
    }
  }

  fetchFromRPC(aavegotchiContract, tokenId, gotchi, user) {
    const _this = this;

    const response = aavegotchiContract.methods.getAavegotchiSvg(tokenId).call()
      .then((svg) => {
        console.log('svg for', tokenId);
        _this.setState(
          { myGotchis: [..._this.state.myGotchis, { tokenId: tokenId, svg: svg, gotchi: gotchi }]},
          () => {
            if (_this.state.myGotchis.length == user.gotchisOwned.length) {
              _this.loadGame();
            }
          }
        );
      })
      .catch((error) => console.log(error));

    return response;
  }

  loadGame() {
    console.log('loadGame', this.state);
    const _this = this;

    let game = {
      width: 32 * 32,
      height: 32 * 20,
      type: Phaser.AUTO,
      scene: [ LoadScene, MenuScene, GameplayScene, GameOverScene, PausedScene ],
      physics: {
        default: 'arcade',
        arcade: {
          debug: false, //true
          fps: 60
        },
      },
      callbacks: {
        preBoot: function (game) {
          game.registry.customData = { };
          game.registry.customData.myGotchis = _this.state.myGotchis;
          game.registry.customData.myEnemies = _this.state.myEnemies;
          game.registry.customData.svgsToGet = _this.state.svgsToGet;

          game.registry.merge(_this.state);
          console.log('preBoot', game.registry);
        }
      },
      fps: {
        target: 60,
        forceSetTimeOut: true
      },
    };

    this.setState({ game });
  }

  render() {
    let { initialize, game } = this.state

    return (
      <div>
        <h1>Gotchi Tower Defense (Beta)</h1>
        <div style={{ "font-family": "m5x7" }}>
          <IonPhaser game={game} initialize={initialize} />
        </div>
        <p>Note: if you are using Brave browser, please disable shields for AavegotchiStats.com to prevent text alignment issues</p>
      </div>
    )
  }
}

export default GotchiTowerDefence;
