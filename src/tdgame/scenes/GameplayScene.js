import Phaser from 'phaser';

import { Constants } from '../Constants';
import { Bullet } from '../prefabs/Bullet';
import { Enemy } from '../prefabs/Enemy';
import { Gotchi } from '../prefabs/Gotchi';

import { UIScene } from './UIScene';

import aavegotchiContractAbi from '../../abi/diamond.json';
import contract from '../../config/aavegotchiContract.json';
import { connectToMatic } from '../../util/MaticClient';


import { Column, TextButton } from 'phaser-ui-tools';

import _ from 'lodash';

// wizard staff, aagent pistol, fireball, grenade
// basic collateral based attack

export class GameplayScene extends Phaser.Scene {
  constructor() {
    super({
      key: Constants.SCENES.GAMEPLAY
    })
  }

  init(data) {
    const _this = this;
    // this.phsyics.startSystem(Phaser.Phsyics.ARCADE);
    this.maticPOSClient = connectToMatic();
    this.aavegotchiContract = new this.maticPOSClient.web3Client.web3.eth.Contract(aavegotchiContractAbi, contract.address);

    this.gotchis = [];
    this.enemies = [];

    console.log('init', data);
    this.musicOn = data.musicOn;
    this.music = this.sound.add('synthwave');
    this.music.setLoop(true);

    if(this.musicOn) {
      this.music.play();
    }
  }

  preload() {
  }

  filterSvgBackground(gotchiSvg) {
    let from = gotchiSvg.search('<g class="gotchi-bg">');
    let fromString = gotchiSvg.substring(from, gotchiSvg.length);
    let to = fromString.search('</g>');
    let newSvg = gotchiSvg.substring(0, from) + fromString.substring(to + 4, gotchiSvg.length);
    return newSvg;
  }

  retrieveGotchiSvgs() {
    const _this = this;
    console.log('retrieveGotchiSvgs', this.registry.customData.myEnemies, this.registry.customData.svgsToGet);
    for (let g = 0; g < 5; g++) {
      let enemy = _this.registry.customData.svgsToGet[g];

      _this.aavegotchiContract.methods.getAavegotchiSvg(enemy.id).call().then(function (svg) {
        _this.registry.customData.svgsToGet = _.remove(_this.registry.customData.svgsToGet, function(g) {
          return g.id != enemy.id;
        });

        _this.registry.customData.myEnemies.push({ tokenId: enemy.id, svg: svg, gotchi: enemy });

        let newSvg = _this.filterSvgBackground(svg);
        let blob = new Blob([newSvg], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);

        console.log('load svg', enemy.id, url);

        _this.load.svg(enemy.id, url, {
          width: 48, height: 48
        });
        _this.load.start();

      }).catch(function (error) {
        console.log(error);
      });
    }
  }

  move(position, moveBy, duration, target) {
    return {
      targets: target,
      x: position.x + moveBy.x,
      y: position.y + moveBy.y,
      duration: duration * Math.abs(moveBy.x + moveBy.y),
      paused: true
    };
  }

  spawnGotchi(tokenId, x, y) {
    const _this = this;
    let gotchi = new Gotchi({ scene: this, x: x, y: y, key: tokenId });
    this.gotchis.push(gotchi);

    var ourUi = this.scene.get(Constants.SCENES.UI);
    gotchi.on('pointerdown', function(pointer) {
      console.log('gotchi clicked', gotchi);
      ourUi.setGotchiPlacementVisibility(false);
      _this.gotchis.map(function(g, i) {
        g.hideRange();
      });
      ourUi.setGotchiUpgradeVisibility(true, gotchi);
    });

    this.initGotchiShooting(gotchi);

    ourUi.setGotchiPlacementVisibility(false);
    ourUi.setGotchiUpgradeVisibility(true, gotchi);
  }

  tweenComplete(tween, targets, custom) {
    var score = custom.scene.get(Constants.SCENES.UI).score;
    custom.scene.remove(Constants.SCENES.UI);
    custom.scene.start(Constants.SCENES.GAMEOVER, { score: score });
  }

  spawnEnemy() {
    const _this = this;

    if (this.registry.customData.myEnemies.length > (this.spawnCount + 1)) {
      let e = this.registry.customData.myEnemies[this.spawnCount];
      let key = e.tokenId; // to fix, remove sacrificed gotchis

      let position = { x: -1 * 32, y: 2.5 * 32 };
      let enemy = new Enemy({ scene: this, x: position.x, y: position.y, key, gotchi: e.gotchi });

      let tweens = [];
      let duration = 15; //50

      let movements = [ [7.5, 0], [0, 10], [10, 0], [0, 4], [1, 0], [0, 2], [6, 0], [0, -11], [-5, 0], [0, -1], [-6, 0], [0, -2], [-1, 0], [0, -2], [1, 0], [0, -1], [20, 0] ]

      movements.map(function(m, i) {
        let moveBy = { x: m[0] * 32, y: m[1] * 32 };

        let t = _this.move(position, moveBy, duration, enemy);

        if (i == movements.length - 1) {
          t.onComplete = _this.tweenComplete;
          t.onCompleteParams = _this;
        }

        tweens.push(t);

        position.x += moveBy.x;
        position.y += moveBy.y;
      });

      this.tweens.timeline({
        tweens: tweens
      });

      this.physics.world.addCollider(this.playerBullets, enemy, function(enemy, bullet) {
        bullet.gotchi.increaseHits();

        bullet.destroy();
        enemy.damage(bullet);

        if (_this.musicOn) {
          _this.damageSound.play({ volume: 3});
        }
      });

      this.enemies.push(enemy);
      this.spawnCount++;

      console.log('spawn count', this.spawnCount, 'myEnemies length', this.registry.customData.myEnemies.length);
      if ((this.registry.customData.myEnemies.length - 2) == this.spawnCount) {
        if (this.registry.customData.svgsToGet.length != 0) {
          _this.retrieveGotchiSvgs();
        }
      }
    }
  }

  initShooting() {
    this.playerBullets = this.physics.add.group();
  }

  initGotchiShooting(gotchi) {
    console.log('initGotchiShooting', gotchi);
    gotchi.shootingTimer = this.time.addEvent({ delay: gotchi.calculateAttackDelay(), callback: this.gotchiShoot, callbackScope: this, loop: true, args: [ gotchi ] });
    //todo reset timer with new speed on levelling
  }

  initSpawning() {
    this.spawnCount = 0;
    this.spawnEnemy();
    this.spawning = this.time.addEvent({ delay: 3000, callback: this.spawnEnemy, callbackScope: this, loop: true });
  }

  gotchiShoot(g) {
    console.log('gotchiShoot', g);

    const _this = this;

    let bullet = this.playerBullets.getFirstDead(false);

    if (!bullet) {
      // list of active enemies
      let activeEnemies = _.filter(this.enemies, { active: true });
      console.log('activeEnemies', activeEnemies);
      if (activeEnemies.length > 0) {
        // for each enemy
        let minDists = [];
        activeEnemies.map(function(e, i) {
          const dist = Phaser.Math.Distance.Between(g.x, g.y, e.x, e.y);
          // if in range
          if (dist <= g.range) {
            minDists.push( { dist: dist, spawnCount: g.spawnCount, gotchi: g, enemy: e });
          }
        });

        if (minDists.length > 0) {
          let bulletPath = _.orderBy(minDists, ['spawnCount', 'asc'])[0];
          let gotchi = bulletPath.gotchi;
          let e = bulletPath.enemy;
          let dist = bulletPath.dist;
          // can shoot
          // do shoot
          // let damage = parseInt(g.info.modifiedRarityScore) * (Math.pow(1.003, g.xp)); // damage increases by 3% every kill
          console.log('damage', gotchi.damage, gotchi.xp, parseInt(gotchi.info.modifiedRarityScore));
          bullet = new Bullet({ scene: _this, x: gotchi.x, y: gotchi.y, damage: gotchi.damage, collateral: gotchi.info.collateral, gotchi: gotchi });
          _this.playerBullets.add(bullet);
          _this.physics.accelerateToObject(bullet, e, Constants.scalars.bulletSpeed);//300);//00);

          if (_this.musicOn) {
            _this.attackSound.play({ volume: 4});
          }
        }
      }
    } else {
      bullet.reset(0, 0)
    }
  }

  create() {
    const _this = this;

    let tdMap = this.add.tilemap('td');

    let terrain = tdMap.addTilesetImage('terrain_atlas', 'terrain');
    let itemset = tdMap.addTilesetImage('items');

    this.floorLayer = tdMap.createStaticLayer('floor', terrain, 0, 0);
    this.topLayer = tdMap.createStaticLayer('top', terrain, 0, 0);

    this.scene.add(Constants.SCENES.UI, UIScene, true, { x: 0, y: 0 });

    this.initShooting();
    this.initSpawning();

    //  Grab a reference to the UI Scene
    var ourUi = this.scene.get(Constants.SCENES.UI);

    // _this.physics.add.collider(gameObject, ourGame.floorLayer);
    // this.floorLayer.setTileIndexCallback([366], (gameObject) => {
    //   console.log('floor touched', gameObject);
    //   ourUi.setGotchiPlacementVisibility(true);
    //   ourUi.setGotchiUpgradeVisibility(false, null);
    // });

    this.input.on('pointerdown', function(pointer) {
      // const tileXY = this.floorLayer.getTileAt(pointer.x, pointer.y)
      const tile = _this.floorLayer.getTileAtWorldXY(pointer.x, pointer.y);

      var rect = { x: pointer.x, y: pointer.y, width: 32, height: 32 };
      var x = rect.x - (rect.width / 2);
      var y = rect.y - (rect.height / 2);
      var within = _this.physics.overlapRect(x, y, rect.width, rect.height);

      if (within.length == 0) {
        ourUi.setGotchiPlacementVisibility(true);
        _this.gotchis.map(function(g, i) {
          g.hideRange();
        });
        ourUi.setGotchiUpgradeVisibility(false, null);
      }
    });


    //  Listen for events from it
    ourUi.events.on('placeGotchi', function (gotchi) {
      _this.spawnGotchi(gotchi.gameObject.texture.key, gotchi.gameObject.x, gotchi.gameObject.y);
      if (_this.musicOn) {
        _this.placeSound.play({ volume: 5});
      }

      console.log('placeGotchi', _this.gotchis);
    }, this);

    if (this.musicOn) {
      this.musicSprite = this.add.sprite(50, 600, 'music_on');
    } else {
      this.musicSprite = this.add.sprite(50, 600, 'music_off');
    }
    this.musicSprite.setScale(0.3);
    this.musicSprite.setInteractive();

    this.musicSprite.on('pointerdown', function (pointer) {
        _this.toggleMusic();
    });

    this.attackSound = this.sound.add("audio_attack");
    this.damageSound = this.sound.add("audio_damage");
    this.pickupSound = this.sound.add("audio_pickup");
    this.placeSound = this.sound.add("audio_place");
  }

  update() {
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;

    if (this.musicOn) {
      this.musicSprite.setTexture('music_on');
      this.music.play();
    } else {
      this.musicSprite.setTexture('music_off');
      this.music.stop();
    }
  }
}
