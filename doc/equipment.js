//
// 没ゲームで同じような実装をしたクラス
//


//あいう @charset utf-8
// vim: set foldmethod=marker :


/** 装備倉庫/袋クラス */
$a.Warehouse = (function(){
    var cls = function(){
    };
    $f.inherit(cls, new Array());
    $f.blendArray(cls);

    //! 後で消す
    ///** 倉庫容量
    //    ! KVSの1キーに保存するので増加時はデータ量注意
    //    ! 後で増やすかもと思ったけど、増やし過ぎるとデータ量はともかくUIが追い付かないので
    //      一旦は止めることにした */
    //cls.MAX_STORE_COUNT = 99;

    // 使用禁止
    cls.prototype.splice = function(){ throw new Error('Error in Warehouse.splice, is disabled') };

    /** 装備を袋に入れて一時保管する
        冒険中はここに入り帰宅時に倉庫に空きが有れば移される, 再冒険時に消える */
    cls.prototype.temporary = function(equipment){
        equipment.isTemporaryStored = true;
        Array.prototype.push.apply(this, [equipment]);
    };

    /** 袋内の指定装備を倉庫へ移す
        @return true=移せた || false=移せなかった */
    cls.prototype.store = function(equipment){
        if (
            this.checkEmpty() === false ||
            $f.inArray(equipment, this.findByTemporary()) === false
        ) {
            return false;
        };
        equipment.isTemporaryStored = false;
        return true;
    };

    /** 指定装備を削除する, @return true=削除成功, false=失敗 */
    cls.prototype.remove = function(equipment){
        var idx = $f.indexOf(equipment, this);
        if (idx === -1) return false;
        equipment.isTemporaryStored = true;
        Array.prototype.splice.apply(this, [idx, 1]);
        return true;
    };

    /** 指定装備を売却する, @return 上記removeメソッドに準ずる */
    cls.prototype.sell = function(equipment){
        if (this.remove(equipment) === true) {
            $a.player.gp.delta(equipment.getSellingprice());
            return true;
        };
        return false;
    };

    /** 指定装備を先頭または末尾へ移動する, @return true=成功, false=失敗 */
    cls.prototype.move = function(equipment, toLast){
        toLast = !!toLast; // false(default)=先頭へ | true=末尾へ
        var idx = $f.indexOf(equipment, this);
        if (idx === -1) return false;
        Array.prototype.splice.apply(this, [idx, 1]);
        if (toLast === false) {
            this.unshift(equipment);
        } else {
            this.push(equipment);
        };
        return true;
    };

    /** 倉庫に空きがあるかを判定する */
    cls.prototype.checkEmpty = function(){
        return this.findByStored().length < $a.player.getMaxStoreCount();
    };

    /** 倉庫内のアイテムのみ抽出する */
    cls.prototype.findByStored = function(){
        return $f.collect(this, function(i, v){ if (v.isTemporaryStored === false) return v });
    };
    /** 袋内のアイテムのみ抽出する
        conditions.overflowOnly: true=残る容量を超えたアイテムのみ抽出 */
    cls.prototype.findByTemporary = function(conditions){
        var conds = conditions || {};
        return $f.collect(this, function(i, v){
            if (v.isTemporaryStored === false) return;
            return v;
        });
    };
    /** 部位キーで抽出する
        conditions.isTemporaryStored: null=無視, true=倉庫内のみ, false=袋内のみ
        conditions.job: obj=職業オブジェクト, 職業別の装備可能な種類のみ */
    cls.prototype.findByPartKey = function(partKey, conditions){
        var conds = conditions || {};
        var isTemporaryStored = ('isTemporaryStored' in conds)? conds.isTemporaryStored: null;
        var job = ('job' in conds)? conds.job: null;
        return $f.collect(this, function(i, v){
            if (v.partKey !== partKey) return;
            if (isTemporaryStored === true && v.isTemporaryStored === false) return;
            if (isTemporaryStored === false && v.isTemporaryStored === true) return;
            if (job !== null && job.checkEquipableType(partKey, v.getEquipmentType()) === false) return;
            return v;
        });
    };

    /** 袋内の容量を超えた分の装備を削除する */
    cls.prototype.cleanTemporary = function(){
        var self = this;
        var overflows = this.findByTemporary({ overflowOnly:true });
        $f.each(overflows, function(i, eq){
            self.remove(eq);
        });
    };

    /** 定型ソートを行う, 攻防順などいくつか増えるようならオプション指定形式にする */
    cls.prototype.sortByRegular = function(){
        // 部位と種類順
        this.sort(function(a, b){
            var __getModOrder = function(eq){
                var modOrder = eq.getMasterData().order;
                if (eq.partKey === 'armor') modOrder += 100;
                else if (eq.partKey === 'shield') modOrder += 1000;
                else if (eq.partKey === 'accessory') modOrder += 10000;
                return modOrder;
            };
            return __getModOrder(a) - __getModOrder(b);
        });
    };

    cls.prototype.pickleTemporary = function(){
        return $f.collect(this.findByTemporary(), function(i, v){ return v.pickle() });
    };
    cls.prototype.pickleStored = function(){
        return $f.collect(this.findByStored(), function(i, v){ return v.pickle() });
    };
    cls.prototype.unpickle = function(){
        var self = this;
        $f.each($a.storage.getData('warehouse'), function(i, v){
            var eq = $a.Equipment.factoryByUnpickle(v);
            self.temporary(eq);
            self.store(eq);
        });
        $f.each($a.storage.getData('backpack'), function(i, v){
            self.temporary($a.Equipment.factoryByUnpickle(v));
        });
    };


    cls._factory = function(){
        var obj = new this();
        return obj;
    };
    cls.factory = cls._factory;

    return cls;
})();


/** 装備一式クラス */
$a.Equipmentset = (function(){
    var cls = function(){
        var self = this;
        /** 所属先キャラクター */
        this.character = undefined;
        /** 部位データ */
        this._partData = {
            weapon: null,
            armor: null,
            shield: null,
            accessory: null//,
        };
    };
    cls.prototype.toString = function(){ return 'Equipmentset' };

    /** 外部参照用の部位キーリスト
        ! 内部で参照してないのはまだ未対応なだけ、落ち着いたら直す */
    cls.PART_KEYS = ['weapon', 'armor', 'shield', 'accessory'];

    /** 部位情報を返す */
    cls.prototype.getPartData = function(){
        return this._partData;
    };
    /** 部位情報をリストで返す */
    cls.prototype.getPartDataList = function(){
        var self = this;
        // 手動定義なのは順番を固定させるため
        var partKeys = ['weapon', 'armor', 'shield', 'accessory'];
        return $f.collect(partKeys, function(nouse, partKey){
            return {
                partKey: partKey,
                equipment: self._partData[partKey]
            };
        });
    };

    /** 指定部位が埋まっているかを判定する, partKey '<部位キー>' */
    cls.prototype.hasPart = function(partKey){
        if (partKey in this._partData === false) {
            throw new Error('Error in Equipmentset.hasPart, not defined partKey=' + partKey);
        };
        return this._partData[partKey] !== null;
    };
    /** 指定部位の装備を返す, @return obj || null */
    cls.prototype.getPart = function(partKey){
        this.hasPart(partKey); // 変な部位キーを入れた時のエラー判定用
        return this._partData[partKey];
    };

    /** 各プロパティ合計を返す, propertyKey=getPropertyDataのキー
        @return int=パワー値合計 | 0=無い場合
        options.ignores arr=除外する部位キーリスト */
    cls.prototype.total = function(propertyKey, options){
        var opts = options || {};
        var ignores = ('ignores' in opts)? opts.ignores: [];
        return $f.sum($f.values(this._partData), function(eq){
            if (eq === null) return;// 装備が無い
            if ($f.inArray(eq.partKey, ignores)) return; // 除外対象
            var prop = eq.getPropertyData()[propertyKey];
            if (prop === undefined) return;// 指定プロパティが無い
            return prop.value;
        });
    };

    //! 装備可否判定はJobにある, そしてこの中では行わないこと！
    //    というのも、データリストア時に腕力その他の条件で装備できなくなる可能性があるため
    //    それを正確に対応しようとすると、装備復旧順を考えるという難しいロジックが必要になる
    /** 装備する */
    cls.prototype.equip = function(equipment){
        var partKey = equipment.partKey;
        this.unequip(partKey); // 強制的に装備を外す
        this._partData[partKey] = equipment;
    };
    /** 装備を外す */
    cls.prototype.unequip = function(partKey){
        this.hasPart(partKey); // 存在しないキー対策, 有効キーだけど装備無し箇所はエラーにしない
        this._partData[partKey] = null;
    };


    /** 部位名を返す */
    cls.getPartName = function(partKey){
        return {
            weapon: '武器',
            armor: '防具',
            shield: '盾',
            accessory: '装飾品'//,
        }[partKey];
    };
    cls.getShortPartName = function(partKey){
        return {
            weapon: '武器',
            armor: '防具',
            shield: '盾',
            accessory: '装飾'//,
        }[partKey];
    };
    cls.getVeryShortPartName = function(partKey){
        return {
            weapon: '武',
            armor: '防',
            shield: '盾',
            accessory: '装'//,
        }[partKey];
    };

    cls.prototype.pickle = function(){
        var json = {};
        $f.each(this._partData, function(partKey, eq){
            if (eq === null) return;
            json[partKey] = eq.pickle();
        });
        return json;
    };
    cls.prototype.unpickle = function(json){
        var self = this;
        $f.each(json, function(partKey, _json){
            // 無い部位は値も入らない予定だけど一応やっとく
            if (_json === null || _json === undefined) return;
            var eq = $a.Equipment.factoryByUnpickle(_json);
            self.equip(eq);
        });
    };


    cls._factory = function(character){
        var obj = new this();
        obj.character = character;
        return obj;
    };
    cls.factory = cls._factory;

    return cls;
})();


/** * 抽象基底装備クラス */
$a.Equipment = (function(){
    var cls = function(){

        /** 装備部位キー, 'weapon'など, Equipmentset._partDataキーと対応 */
        this.partKey = undefined;
        /** 装備種別, 'sword'/'spear'など, 部位内での分類だがこれ自体も部位を通じてユニーク */
        this._equipmentType = undefined;
        /** 形状種別, 装備種別での補助分類を示す,
            '0'|'1'|'2'のいずれかで装備別に無いものもある, 種別がそのままパワー加算値になっている */
        this._shapeType = undefined;
        /** 素材種別 */
        this._materialType = undefined;

        /** 品質値, int=0-50 */
        this._quality = 0;

        /** エンチャント群 */
        this._enchants = undefined;

        /** アーティファクトID, str | null=非AF */
        this._artifactId = null;

        /** エゴ名のキャッシュ */
        this._egoNameCache = null;

        /** 一時格納フラグ */
        this.isTemporaryStored = true;
    };
    cls.prototype.toString = function(){
        return this.getEgoName();
    };

    function __INITIALIZE(self){
        var material = self._getMaterialData();

        self._enchants = {};
        // 素材によるデフォルトエンチャント
        $f.each(material.enchants, function(enchantType, power){
            //! 部位は問わない、ようにしてみる
            self._setEnchant(enchantType, power);
            //// 有効な部位か
            //if (cls._checkAttachableEnchant(enchantType, self.partKey)) {
            //};
        });
    };

    /** 自分の装備種類マスタデータを返す */
    cls.prototype.getMasterData = function(){
        return this.__myClass__.createMasterData({ cache:true })[this._equipmentType];
    };
    /** 自分の素材マスタデータを返す */
    cls.prototype._getMaterialData = function(){
        var data = cls.createMaterialMasterData({ cache:true })[this._materialType];
        return data;
    };
    /** 自分のAFマスタデータを返す */
    cls.prototype._getArtifactData = function(){
        var data = cls.artifacts[this._artifactId];
        return data || null;
    };
    /** AFマスタデータの項目値を直接返す, 数値を返すもののみに使用する, 非AFは0を返す */
    cls.prototype._getArtifactPower = function(key){
        var af = this._getArtifactData();
        if (af === null) return 0;
        return af[key];
    };

    /** 品質を設定する */
    cls.prototype.setQuality = function(value){
        this._quality = value;
    };

    /** エンチャントの存否判定をする */
    cls.prototype.hasEnchant = function(enchantType){
        return enchantType in this._enchants;
    };
    /** エンチャント値を返す, 無い場合は 0 */
    cls.prototype.getEnchantPower = function(enchantType){
        var data = this._enchants[enchantType];
        return (data !== undefined)? data.power: 0;
    };
    /** エンチャントを設定する, 同じものが既にある場合は効果が高ければ上書きする
        options.forceOverwrite: true=値の大小に関わらず強制上書き */
    cls.prototype._setEnchant = function(enchantType, power, options){
        var opts = options || {};
        var forceOverwrite = ('forceOverwrite' in opts)? opts.forceOverwrite: false;
        var master = cls.createEnchantMasterData();
        // マスタに無いキーは無視する
        //! エラーにしないのは、エンチャント種別キーを変えた場合にunpickle復元時にエラーにしないため
        //  エンチャントが消えることになっていいのかという気はするが、現状そうなっている
        if (enchantType in master === false) return;
        if (
            forceOverwrite ||
            this.hasEnchant(enchantType) === false ||
            this.getEnchantPower(enchantType) < power
        ) {
            this._enchants[enchantType] = {
                power: power//,
            };
            // 軽量と荷重の相互打消し
            //- 差引相殺では無く高い片方の最大値が残る, とりあえずはAFの個性を残すため
            //- 同値の場合は上書き順序で残る方が決まるが
            //  複数エンチャランダム順からの最後AFなので現状はこれでOK
            //! 存否確認は別途しないと、削除時に無いよエラーになる
            if (
                enchantType === 'lightweight' &&
                this.hasEnchant('heavyweight') && power >= this.getEnchantPower('heavyweight')
            ) {
                delete this._enchants.heavyweight;
            } else if (
                enchantType === 'heavyweight' &&
                this.hasEnchant('lightweight') && power >= this.getEnchantPower('lightweight')
            ) {
                delete this._enchants.lightweight;
            };
        };
    };
    /** 指定したエンチャントをパワーをランダム選択して設定する
        - 最大値はソース参照, ただしAFは別
        - tlvがパワーに影響しないのは意図的で、もし影響させてしまうと
          効果が個数と品質に掛かって影響が指数倍になってしまうから */
    cls.prototype.randSetEnchant = function(enchantType){
        var power = 0;
        // エンチャントマスタデータ取得, 存否判定兼ねる
        var md = cls._getEnchantMasterData(enchantType);
        // 基本能力値, pow=1-5
        if ($f.inArray(enchantType, $a.Character.baseParameterNames)) {
            power = ~~$f.randRatioChoice({ 1:125, 2:64, 3:27, 4:8, 5:1 });
        // 特効, pow=1-3
        } else if (enchantType in $a.Race.getSlayers()) {
            power = ~~$f.randRatioChoice({ 1:32, 2:4, 3:1 });
        // 追加効果, pow=1-3
        } else if ($f.inArray(enchantType, $a.Proclist.getEnchantKeys())) {
            power = ~~$f.randRatioChoice({ 1:25, 2:9, 3:1 });
        // 攻撃効果, pow=1-2
        } else if ($f.inArray(enchantType, ['rangeboost', 'comboboost', 'distanceboost',
            'criticalhitboost'])) {
            power = ~~$f.randRatioChoice({ 1:8, 2:1 });
        // 鎧効果
        } else if ($f.inArray(enchantType, ['hpregeneration', 'mpregeneration'])) {
            power = ~~$f.randRatioChoice({ 1:9, 2:4, 3:1 });
        // 追尾/身軽, pow=1-5
        //   分布割合が指数倍でないのは、まずは平均を技量/敏捷上昇による期待値以上にしたかったため
        //   で、それを指数倍形式で表現すると最大値が大きくなり過ぎて
        //   バランス崩壊＆大抵低い値なので付いてもうれしくない ということになるのでこうした
        } else if (enchantType === 'hitboost' || enchantType === 'avoidanceboost') {
            power = ~~$f.randRatioChoice({ 1:5, 2:4, 3:3, 4:2, 5:1 });
        // 帯魔力/加速, pow=1-3
        } else if (enchantType === 'magicinclusion' || enchantType === 'speedboost') {
            power = ~~$f.randRatioChoice({ 1:32, 2:4, 3:1 });
        // 軽量/荷重, pow=1-2, ! MAX3にするとAFの個性が失われ易くなる
        } else if (enchantType === 'lightweight' || enchantType === 'heavyweight') {
            power = ~~$f.randRatioChoice({ 1:8, 2:1 });
        // 高価
        } else if (enchantType === 'highprice') {
            power = ~~$f.randRatioChoice({ 1:5, 2:4, 3:3, 4:2, 5:1 });
        // その他は1のみ, 耐性など
        } else {
            power = 1;
        };
        this._setEnchant(enchantType, power);
    };
    /** アーティファクトのエンチャント効果群を適用する */
    cls.prototype._applyArtifactEnchants = function(){
        var self = this;
        var af = this._getArtifactData();
        $f.each(af.enchants, function(enchantType, power){
            // 負の効果はAF設定値が強制適用される, 個性付けのため
            if (power < 0) {
                self._setEnchant(enchantType, power, { forceOverwrite:true });
            } else {
                self._setEnchant(enchantType, power);
            };
        });
    };
    /** 全エンチャントを削除する
        とりあえずはリストア時に装飾品の初期エンチャを消すために使っている */
    cls.prototype.clearAllEnchants = function(){
        this._enchants = {};
    };

    /** エンチャント称号を返す, @return str || null */
    cls.prototype.getEnchantTitle = function(){
        var titles = []; // [[<タイトル>, <称号優先度スコア>] のリスト
        var baseParameterCount = 0;
        var master = cls.createEnchantMasterData({ cache:true });
        var material = this._getMaterialData();
        $f.each(this._enchants, function(enchantType, enchantData){
            var pow = enchantData.power;
            var md = master[enchantType];
            // 素材のエンチャントなら表示しない
            if (enchantType in material.enchants) return;
            // 称号候補リストへ追加
            titles.push([
                md.enchantTitle,
                // 1)優先順位 2)power値 3)マスタデータ定義 の順でソート
                md.titlePriority * 100000 + pow * 1000 + 100 - md.order
            ]);
            // 基本能力値上昇エンチャント数を数える
            if ($f.inArray(enchantType, $a.Character.baseParameterNames)) {
                baseParameterCount += 1;
            };
        });
        if (titles.length === 0) return null;
        // 才能値上昇が複数ある場合の特殊称号
        if (baseParameterCount >= 3) {
            titles.push(['天分の', 899999]);
        } else if (baseParameterCount === 2) {
            titles.push(['才能の', 599999]);
        };
        // スコアで比較して最も優先されるものが称号になる
        return titles.sort(function(a, b){
            return b[1] - a[1];
        })[0][0];
    };

    /** アーティファクトのスキル付与情報をリストで返す
        @return arr 各要素=['<スキルクラス名>', '<スキル名>', <上昇LV>]
                    非アーティファクトの場合も空配列を返す */
    cls.prototype.getArtifactSkillDataList = function(){
        var list = [];
        var af = this._getArtifactData();
        // 非AFかスキルが無い
        if (af === null || $f.keys(af.skills).length === 0) return list;
        $f.each(af.skills, function(skillClassName, slv){
            var klass = $a.$skill.get(skillClassName);
            list.push([skillClassName, klass.factory().skillName, slv]);
        });
        return list;
    };
    /** アーティファクトのスキル付与効果を実行する, AF判定やスキル存否判定含む
        @return arr スキル名リスト */
    cls.prototype.applyArtifactSkills = function(character){
        var skillNames = [];
        $f.each(this.getArtifactSkillDataList(), function(nouse, data){
            character.gainSkill(data[0], data[2]);
            skillNames.push(data[1]);
        });
        return skillNames;
    };

    /** 部位名を返す */
    cls.prototype.getPartName = function(){
        return $a.Equipmentset.getPartName(this.partKey);
    };
    cls.prototype.getShortPartName = function(){
        return $a.Equipmentset.getShortPartName(this.partKey);
    };

    /** エゴ名を返す */
    cls.prototype.getEgoName = function(){
        if (this._egoNameCache !== null) return this._egoNameCache;
        var af = this._getArtifactData();
        if (af !== null) {
            return this._egoNameCache = '\u2605' + af.artifactName;
        };
        var p = this.getEnchantTitle() || '';
        var e = this.getShapeName();
        var m = this.getMaterialName();
        var q = this._quality > 0 ? $f.toModifierString(this._quality): '';
        return this._egoNameCache = $f.format('{0}{1}の{2}{3}', p, m, e, q);
    };

    /** 装備種別を返す */
    cls.prototype.getEquipmentType = function(){ return this._equipmentType };
    /** 装備種類名を返す */
    cls.prototype.getEquipmentName = function(){
        return this.getMasterData().label;
    };

    /** 装備形状名を返す, 現在カタカナ名は使っていない */
    cls.prototype.getShapeName = function(){
        return this.getMasterData().shapes[this._shapeType].shapeName;
    };

    /** 素材名を返す, 現在、通常名orカタカナ名の片方しか使ってない */
    cls.prototype.getMaterialName = function(){
        var data = this._getMaterialData();
        return data.isKatakanaPriority ? data.katakanaName: data.materialName;
    };

    /** 重量を返す, @return int 負の値も返す */
    cls.prototype.getWeight = function(){
        var base = this._getMaterialData().weight;
        var rate = this.getMasterData().sizeRate;
        // 軽量5 は無条件で 重量0 になる, なお現在は荷重と軽量が同時に付くことは無い
        if (this.getEnchantPower('lightweight') === 5) return 0;
        //! マイナス重量は現在は無い
        $f.times(this.getEnchantPower('lightweight'), function(){
            (base > 0)? rate /= 2: rate *= 2; // 重量がマイナスのものは値を増加
        });
        $f.times(this.getEnchantPower('heavyweight'), function(){
            (base > 0)? rate *= 2: rate /= 2; // 重量がマイナスのものは値を減少
        });
        return Math.round(base * rate);
    };

    /** 攻撃力を返す */
    cls.prototype.getAttack = function(){
        var afp = this._getArtifactPower('attack');
        if (this.partKey !== 'weapon') return afp;
        var ed = this.getMasterData();
        var md = this._getMaterialData();
        //! 武器の場合はAF効果も形状の影響を受ける
        //  これはデータ設定時に形状を差し引いた値の方がやり易いため, また負の値は影響させない
        if (afp > 0) afp *= ed.powerRate;
        var b = md.hardness * ed.powerRate;
        var t = b + this._quality + afp;
        return $f.withinNum(Math.ceil(t), 0);
    };

    /** 魔法攻撃力を返す */
    cls.prototype.getMagicAttack = function(){
        var afp = this._getArtifactPower('magicAttack');
        if (this.partKey !== 'weapon') return afp;
        var md = this._getMaterialData();
        // 杖・ワンドか帯魔力付きはLV*100%が保証される
        var magicRate = md.magicRate;
        if (
            magicRate < 1.0 && (
                $f.inArray(this._equipmentType, ['staff', 'wand']) ||
                this.getEnchantPower('magicinclusion') > 0
            )
        ) { magicRate = 1.0 };
        // 魔法率が0.5未満はいっそ魔法攻撃力を付けない
        // 半端にあっても役立たないし、雰囲気的にこちらの方が良さそう
        if (magicRate < 0.5) return 0;
        var b = md.lv * magicRate;
        // 杖・ワンドにはボーナスが付く, 物理側のpowerRateに相当
        if (this._equipmentType === 'staff') b *= 1.2;
        else if (this._equipmentType === 'wand') b *= 1.4;
        var t = b + this._quality + afp;
        return $f.withinNum(Math.ceil(t), 0);
    };

    /** 防御力を返す */
    cls.prototype.getDefense = function(){
        var afp = this._getArtifactPower('defense');
        if (this.partKey !== 'armor' && this.partKey !== 'accessory') return afp;
        var ed = this.getMasterData();
        var md = this._getMaterialData();
        var b = md.hardness * ed.powerRate;
        var t = b + this._quality;
        if (this.partKey === 'accessory') {
            t = ~~(t * ed.sizeRate * 0.5);// 効果を半分にしてサイズ割合を掛けて端数切捨て
        };
        t += afp;
        return $f.withinNum(Math.ceil(t), 0);
    };

    /** 魔法防御力を返す */
    cls.prototype.getMagicDefense = function(){
        var afp = this._getArtifactPower('magicDefense');
        if (this.partKey !== 'armor' && this.partKey !== 'accessory') return afp;
        var ed = this.getMasterData();
        var md = this._getMaterialData();
        var magicRate = md.magicRate;
        // 衣は50%/帯魔力は100%保証
        if (magicRate < 0.5 && this._equipmentType === 'robe') magicRate = 0.5;
        if (magicRate < 1.0 && this.getEnchantPower('magicinclusion') > 0) magicRate = 1.0;
        var b = md.lv * magicRate;
        // 衣はボーナス
        if (this._equipmentType === 'robe') b *= 1.25;
        // 品質も魔法率で下がる, 上がりはしない
        //! わかり難いけど、魔石=165% などに設定されている値は品質に掛けない, という処理
        //! バランス的には品質そのままを足すべきなのだが、魔防は無くても左程困らないので
        //  素材の個性を表現する方を重視した
        //    「困らない」というのは、そもそも使う敵種類が少なく食らう場合は強力なので
        //    「優先して倒して食らわないようにする」ということが前提になっているため
        var t = b + this._quality * $f.withinNum(magicRate, null, 1.0);
        if (this.partKey === 'accessory') {
            t = ~~(t * ed.sizeRate * 0.5);
        };
        t += afp;
        return $f.withinNum(Math.ceil(t), 0);
    };

    /** 命中率を返す */
    cls.prototype.getHit = function(){
        var m = this.getMasterData();
        var t = (m.hit || 0); //! 防具の場合はhitプロパティが無いため
        t += this.getEnchantPower('hitboost') * 5; // 追尾エンチャ
        t += this._getArtifactPower('hit');
        return t;
    };

    /** 回避率を返す */
    cls.prototype.getAvoidance = function(){
        var t = this.getEnchantPower('avoidanceboost') * 5; // 身軽エンチャ
        t += this._getArtifactPower('avoidance');
        return t;
    };

    /** 特殊成功率を返す */
    cls.prototype.getSpecial = function(){
        var t = 0;
        t += this._getArtifactPower('special');
        return t;
    };

    /** 特殊抵抗率を返す */
    cls.prototype.getResistance = function(){
        var t = 0;
        t += this._getArtifactPower('resistance');
        return t;
    };

    /** 受け流し率を返す */
    cls.prototype.getParry = function(){
        var afp = this._getArtifactPower('parry');
        if (this.partKey !== 'shield') return afp;
        var ed = this.getMasterData();
        var md = this._getMaterialData();
        //! 盾は品質を含めて乗算する, 大小で差が出た方が好ましいから
        var b = md.hardness + this._quality;
        var t = ed.basePower + b * ed.powerRate + afp;
        return $f.withinNum(Math.ceil(t), 0, ed.maxPower);
    };

    /** 魔法受け流し率を返す */
    cls.prototype.getMagicParry = function(){
        var afp = this._getArtifactPower('magicParry');
        if (this.partKey !== 'shield') return afp;
        var ed = this.getMasterData();
        var md = this._getMaterialData();
        var magicRate = md.magicRate;
        if (magicRate < 1.0 && this.getEnchantPower('magicinclusion') > 0) magicRate = 1.0;
        var b = md.lv * magicRate + this._quality;
        var t = b * ed.powerRate + afp;
        return $f.withinNum(Math.ceil(t), 0, ed.maxPower);
    };

    /** 全プロパティデータをまとめて返す */
    cls.prototype.getPropertyData = function(){
        var self = this;
        var md = this.getMasterData();
        //! 片手両手と飛距離は、マスタデータしか不要で、かつ通常下のプロパティリストとは
        //  やや違う出力の方法になるはずなのでここには含めない
        var data = {};
        var order = 0;
        // 各能力値から
        var _bases = [
            ['weight', 'getWeight', '重量', '重量'],
            ['attack', 'getAttack', '攻撃力', '攻撃'],
            ['defense', 'getDefense', '防御力', '防御'],
            ['magicattack', 'getMagicAttack', '魔法攻撃力', '魔攻'],
            ['magicdefense', 'getMagicDefense', '魔法防御力', '魔防'],
            ['hit', 'getHit', '命中率', '命中'],
            ['avoidance', 'getAvoidance', '回避率', '回避'],
            ['special', 'getSpecial', '特殊成功率', '特成'],
            ['resistance', 'getResistance', '特殊抵抗率', '特抵'],
            ['parry', 'getParry', '盾回避率', '盾'],
            ['magicparry', 'getMagicParry', '魔法盾回避率', '魔盾']//,
        ];
        $f.each(_bases, function(nouse, b){
            var key = b[0];
            var accessor = b[1];
            var name = b[2];
            var shortName = b[3];
            var value = self[accessor]();
            if (value === 0 && key !== 'weight') return; // 重量以外の0は返さない
            data[key] = {
                order: order,
                value: value,
                propertyName: name,
                propertyShortName: shortName
            };
            order += 1;
        });
        // エンチャントから
        $f.each(cls.createEnchantMasterData({ cache:true }), function(enchantType, edata){
            // 有り得ないエラー, エンチャントキー同士の重複やプロパティキーとの衝突すると発生する
            if (enchantType in data) {
                throw new Error('Error in Equipment.getPropertyData, duplicated property key by enchantType=' + enchantType);
            };
            var pow = self.getEnchantPower(enchantType);
            if (pow === 0) return;
            data[enchantType] = {
                order: order,
                value: pow,
                propertyName: edata.enchantName,
                propertyShortName: edata.enchantName
            };
            order += 1;
        });
        return data;
    };
    /** 全プロパティデータをリストで返す */
    cls.prototype.getPropertyDataList = function(){
        var list = [];
        $f.each(this.getPropertyData(), function(k, v){ list.push(v) });
        return list.sort(function(a, b){ return a.order - b.order });
    };
    /** 全プロパティデータ＋重量などのその他データを、一行のテキストで返す */
    cls.prototype.getPropertyDataText = function(){
        var mas = this.getMasterData();
        var t = '';
        if (this.partKey === 'weapon') {
            // 飛距離
            t += {1:'S', 2:'M', 3:'L'}[mas.distance] + ', ';
            // 片手/両手
            if (mas.isTwohanded) {
                t += '両, ';
            } else {
                t += '片, ';
            };
        };
        // プロパリスト
        t += $f.collect(this.getPropertyDataList(), function(nouse, data){
            return data.propertyShortName + data.value;
        }).join(', ');
        // 売価
        t += ', ' + this.getSellingprice() + 'G';
        return t;
    };

    /** エンチャントによる追加効果データリストを返す
        arr=各要素は Proclist.add の引数リスト | 空配列
        今は武器にしかつかず、使用側でも武器しか判定していない */
    cls.prototype.getProcDataList = function(){
        var argsList = [];
        var masterData = $a.Proclist.getEnchantData();
        $f.each(this._enchants, function(enchantType, enchantData){
            if (enchantType in masterData === false) return;
            var m = masterData[enchantType];
            var rate = enchantData.power * 0.25 + 0.25;// 発動率 50/75/100%
            argsList.push([
                m.buffClassName,
                rate,
                m.special,
                { effectTime:m.effectTime }
            ]);
        });
        return argsList;
    };

    /** 売価を返す, @return int 1以上-ほぼ4桁以内 */
    cls.prototype.getSellingprice = function(){
        var mas = this.getMasterData();
        var mat = this._getMaterialData();
        // 基本素材価格／基本品質価格／美術的価値／基本価格
        //   一部のアクセサリは美術的価値を増幅する, "金の指輪"などを拾ったときにうれしくさせるため
        var matPrice = mat.lv * 1;
        var quaPrice = this._quality * 1;
        var artisticPrice = mat.artisticValue * 20;
        if (this.partKey === 'accessory') {
            artisticPrice *= (1 + mas.artisticValueRate);// 素材効果ブースト
            artisticPrice += mas.artisticValueRate * 10;// 固定値ボーナス
        };
        var basePrice = matPrice + quaPrice + artisticPrice;
        // プロパティ数による係数, 素材固定付与分も入ってしまうけど今は無視している
        var propCount = $f.keys(this._enchants).length;
        var rate = 1.0 + propCount * propCount * 0.25;
        // 高価エンチャによる係数
        var slv = this.getEnchantPower('highprice');
        rate *= 1.0 + slv;
        var hpBonus = 100 * slv;
        // AFの場合は固定ボーナス, 出現比率により 1500-6000
        var afBonus = 0;
        var afRarity = 0;
        var af = this._getArtifactData();
        if (af !== null) {
            afRarity = $f.withinNum(11 - af.ratio, 1);
            afBonus = 1000 + Math.pow(afRarity, 2) * 40;
        };

        return Math.ceil(basePrice * rate) + hpBonus + afBonus;
    };


    //
    // 素材関連
    //
    /** 素材マスタデータを返す
        options.cache true=キャッシュを使う */
    cls.createMaterialMasterData = function(options){
        var opts = options || {};
        var cache = ('cache' in opts)? opts.cache: false;
        if (cache && arguments.callee.__cache !== undefined) {
            return arguments.callee.__cache;
        };
        var datas = {};
        $f.each(cls._materialData, function(idx, src){
            var data = {}, tmp;
            data.order = idx;
            tmp = src[0].split(',');
            data.materialType = tmp[0];
            data.materialName = tmp[1];
            data.katakanaName = tmp[2];
            data.isKatakanaPriority = tmp[3] === 'K';
            data.lv = src[1]; // パワーに相当する値
            tmp = src[2].split(',');
            data.hardness = parseInt(tmp[0]);// こっちは物理的な硬さ
            data.forWeapon = tmp[1].substr(0, 1) === 'T';
            data.forArmor = tmp[1].substr(1, 1) === 'T';
            data.forShield = tmp[1].substr(2, 1) === 'T';
            // 魔力率, 魔法攻撃力や魔法防御力に影響
            data.magicRate = parseInt(tmp[2]) / 100;
            // 各装備の基本となる重量, これに各装備のサイズ率を乗じて実重量になる
            data.weight = parseInt(tmp[3]);
            // 美術的価値, 売価に影響, 0-5
            data.artisticValue = parseInt(tmp[4]);
            // 素材固有能力
            data.enchants = {};
            if (src[3] !== undefined) {
                data.enchants = src[3];// { '<種別キー>':<パワー> }
            };
            datas[data.materialType] = data;
        });
        return arguments.callee.__cache = datas;
    };
    /**
     * 素材設定データ
     * - 鉄/鋼/玉鋼/アルミ/チタン が基準
     * - 実在する宝石は magicRate=50%
     * - マイナス重量は忍者仕様で使わなくなったので必要性が薄れたのと
     *   大きいサイズ程マイナスが大きくなるのが変な気がして止めた
     * - 2w以下の素材は服で0wになる
     */
    cls._materialData = [
        ['bone,骨,ボーン,N', 1, '2,TTT,10%,3w,0'],
        ['bronze,青銅,ブロンズ,N', 1, '3,TTT,0%,7w,0'],
        ['cloth,布,クロース,N', 1, '1,FTT,0%,1w,0'],
        ['brass,真鍮,ブラス,N', 2, '3,TTT,0%,5w,0'],
        ['glass,ガラス,グラス,N', 2, '2,TTT,50%,3w,0'],
        ['leather,革,レザー,N', 2, '2,FTT,0%,2w,0'],
        ['iron,鉄,アイアン,N', 3, '5,TTT,0%,5w,0'],
        ['shell,甲羅,シェル,N', 3, '4,FTT,10%,6w,0'],
        ['feather,羽,フェザー,N', 3, '1,FTT,10%,0w,0'],
        ['steel,鋼,スチール,N', 5, '7,TTT,0%,5w,0'],
        ['silver,銀,シルバー,N', 5, '4,TTT,75%,6w,1'],
        ['obsidian,黒曜石,オブシダン,N', 7, '8,TTT,0%,4w,0'],
        ['pearl,真珠,パール,N', 8, '5,TTT,50%,4w,1'],
        ['steelplus,玉鋼,ウーツ,N', 10, '10,TTT,0%,5w,0'],
        ['gold,金,ゴールド,N', 10, '5,TTT,25%,20w,3'],
        ['wing,翼,ウィング,N', 10, '5,FTT,25%,0w,0', { speedboost:1 }],
        ['meteoric,隕鉄,メテオ,N', 12, '12,TTT,125%,8w,0', { magicinclusion:1 }],
        ['aluminium,アルミ,アルミニウム,N', 15, '15,TTT,0%,2w,0'],
        ['ruby,紅玉,ルビー,K', 15, '12,TTT,50%,4w,2'],
        ['platinum,白金,プラチナ,N', 16, '13,TTT,25%,20w,3'],
        ['crystal,水晶,クリスタル,N', 18, '9,TTT,100%,3w,0'],
        ['cloud,雲糸,クラウド,N', 19, '13,FTT,0%,0w,0'],
        ['titan,チタン,チタン,N', 20, '20,TTT,0%,5w,0'],
        ['emerald,緑玉,エメラルド,K', 20, '15,TTT,50%,4w,2'],
        ['spritcloth,霊布,スピリット,N', 24, '12,FTT,100%,1w,0', { mpregeneration:1 }],
        ['diamond,金剛石,ダイア,K', 25, '25,TTT,50%,4w,4'],
        ['ether,エーテル,エーテル,N', 25, '18,TTT,0%,0w,0'],
        ['dark,暗黒金,ダーク,N', 25, '25,TTT,0%,25w,0'],
        ['hydra,ヒドラ革,ヒドラ,N', 28, '26,FTT,15%,3w,0', { hpregeneration:1 }],
        ['damascus,ダマスカス,ダマスカス,N', 30, '32,TTT,0%,5w,0'],
        ['phoenix,不死鳥,フェニックス,N', 34, '20,FTT,100%,0w,2', { hpregeneration:2 }],
        ['magi,魔石,マギ,N', 35, '10,TTT,165%,3w,1', { magicinclusion:2, mpregeneration:1 }],
        ['hihiirokane,ヒヒイロカネ,ヒヒイロ,N', 35, '35,TTT,0%,5w,0'],
        ['dragon,竜鱗,ドラゴン,N', 40, '42,TTT,25%,3w,1', { hpregeneration:1 }],
        ['laputa,浮遊石,ラピュタ,N', 40, '30,TTT,50%,0w,2', { speedboost:1 }],
        ['monolith,モノリス,モノリス,N', 40, '43,TTT,50%,25w,0'],
        ['adamant,アダマント,アダマント,N', 45, '60,TTT,0%,9w,2'],
        ['mithril,ミスリル,ミスリル,N', 45, '40,TTT,125%,1w,5', { magicinclusion:1 }],
        ['orichalc,神鉄,オリハルコン,K', 50, '50,TTT,100%,5w,4']//,
    ];

    //
    // 装備種類関連
    //
    /** 各装備マスタデータの1データが規格に沿ったものであるかを検証する */
    cls._checkEquipmentMasterData = function(data){
        //! あんまり詳細には出来ないので
        //  全装備で共通化したい関数に関わるものだけにする
        //! 'createMasterData' 関数名も変えてはいけない
        if (
            'equipmentType' in data === false ||
            'label' in data === false ||
            'ratio' in data === false ||
            'sizeRate' in data === false ||
            'powerRate' in data === false ||
            'shapes' in data === false
        ) {
            throw new Error('Error in Equipment._checkEquipmentMasterData, invalid data format=' + data);
        };
    };
    /** 選択比率を考慮して武器の装備種別と形状を返す
        masterData 各装備種類のマスターデータ, 出現率を調整できるように引数で渡すことにする
        @return [equipmentType, shapeType] */
    cls._randChoiceEquipment = function(masterData){
        var ratios = {};
        $f.each(masterData, function(k, v){
            ratios[k] = v.ratio;
        });
        var equipmentType = $f.randRatioChoice(ratios);
        var shapeType = $f.randChoice($f.keys(masterData[equipmentType].shapes));
        return [equipmentType, shapeType];
    };


    //
    // エンチャント関連
    //
    /** エンチャントマスタデータを返す
        options.cache true=キャッシュを使う */
    cls.createEnchantMasterData = function(options){
        var opts = options || {};
        var cache = ('cache' in opts)? opts.cache: false;
        if (cache && arguments.callee.__cache !== undefined) {
            return arguments.callee.__cache;
        };
        var datas = {};
        $f.each(cls._enchantData, function(idx, src){
            var data = {}, tmp;
            data.order = idx;
            tmp = src[0].split(',');
            data.enchantType = tmp[0];
            data.enchantName = tmp[1];
            data.enchantTitle = tmp[2];
            data.ratio = src[1];
            tmp = src[2].split(',');
            data.titlePriority = parseInt(tmp[0].replace(/^P/, ''));
            // ランダム付与時に付くかのフラグ, ランダム以外なら無関係
            data.forWeapon = tmp[1].substr(0, 1) === 'T';
            data.forArmor = tmp[1].substr(1, 1) === 'T';
            data.forShield = tmp[1].substr(2, 1) === 'T';
            data.forAccessory = tmp[1].substr(3, 1) === 'T';
            // オプションデータ
            // options.minTlv: 出現に必要なTLV
            data.options = {};
            if (src[3] !== undefined) data.options = src[3];
            datas[data.enchantType] = data;
        });
        return arguments.callee.__cache = datas;
    };
    //! キーの重複注意
    //  他エンチャントだけでなく 'attack' などの基本プロパティキーとも同じにしないこと
    //  詳細は getPropertyData を参照
    //! 称号表示優先順は 1)優先順位値 2)power実値 3)下記リスト順
    //  なるべく装備種別内で、優先順位値内のpowerを揃えること
    //! 以下の貫通効果は、効果を派手にするとバランスが崩れるし微妙だとわからないので一旦止め
    //  多分「特定の敵に有効な能力」を「装備」という戦闘中選択できないことに
    //  設定してはダメなんだと思う, 特効はその為に敵配置なども考慮してるので役立つだけ
    //  ['penetrationboost,貫通,貫通の', 1.0, 'P4,TFFF'],
    cls._enchantData = [
        // スレイ効果(上級)
        // 攻撃効果(レア)
        ['rangeboost,次元,次元の', 0.25, 'P7,TFFF'],
        ['comboboost,早業,早業の', 0.25, 'P7,TFFF'],
        // スレイ効果(下級), 対象が多い順
        ['vsevil,対邪,聖なる', 1.0, 'P6,TFFF'],
        ['vshuman,対人,殺意の', 1.0, 'P6,TFFF'],
        ['vsbeast,対獣,狩りの', 1.0, 'P6,TFFF'],
        ['vselement,対精,霧散の', 1.0, 'P6,TFFF', { minTlv:24 }],
        ['vsunknown,対謎,真理の', 0.0, 'P6,TFFF', { minTlv:24 }], // 一旦出現しない
        // 耐性
        ['resistancesleep,耐眠,耐眠の', 0.25, 'P6,FTTT'],
        ['resistanceparalysis,耐痺,耐痺の', 0.25, 'P6,FTTT'],
        ['resistanceblindness,耐盲,耐盲の', 0.25, 'P6,FTTT'],
        // 攻撃効果(一般)
        ['criticalhitboost,必殺,必殺の', 1.0, 'P5,TFFF'],
        ['distanceboost,遠当,遠当の', 1.0, 'P5,TFFF'],
        // 鎧効果(一般)
        ['hpregeneration,回復,回復の', 1.0, 'P5,FTTT'],
        ['mpregeneration,瞑想,瞑想の', 1.0, 'P5,FTTT'],
        // 命中/回避, パワー最大値と分布が他と大分違うので分けた
        ['hitboost,追尾,追尾の', 1.0, 'P4,TFFF'],
        ['avoidanceboost,身軽,身軽の', 1.0, 'P4,FTFF'],
        // 追加効果, 便利な順
        ['procsleep,眠り,眠りの', 0.5, 'P3,TFFF'],
        ['proctumble,転倒,転倒の', 1.0, 'P3,TFFF'],
        ['procparalysis,麻痺,麻痺の', 1.0, 'P3,TFFF'],
        ['procblindness,盲目,盲目の', 1.0, 'P3,TFFF'],
        ['procsrip,よろ,よろけの', 1.0, 'P3,TFFF'],
        // 才能値
        ['strength,腕力,腕力の', 1.0, 'P2,FTTT'],
        ['vitality,体力,体力の', 1.0, 'P2,FTTT'],
        ['skillfulness,技量,技量の', 1.0, 'P2,FTTT'],
        ['quickness,敏捷,敏捷の', 1.0, 'P2,FTTT'],
        ['magic,魔力,魔力の', 1.0, 'P2,FTTT'],
        ['will,意志,意志の', 1.0, 'P2,FTTT'],
        ['wisdom,知恵,知恵の', 1.0, 'P2,FTTT'],
        // その他, 低効果
        ['magicinclusion,帯魔,魔法の', 2.0, 'P1,TTTT'],
        ['speedboost,加速,加速の', 2.0, 'P1,TTTT'],
        ['lightweight,軽量,軽い', 2.0, 'P1,TTTF'],
        ['heavyweight,荷重,重い', 0.5, 'P1,TTTF'],
        ['highprice,高価,貴重な', 0.5, 'P1,TTTT']//,
    ];
    /** 指定エンチャントのマスタデータを返す */
    cls._getEnchantMasterData = function(enchantType){
        var data = cls.createEnchantMasterData({ cache:true })[enchantType];
        if (data === undefined) {
            throw new Error('Error in Equipment._getEnchantMasterData, not defined enchantType=' + enchantType );
        };
        return data;
    };
    /** その部位に付けられるエンチャントかを判定する */
    cls._checkAttachableEnchant = function(enchantType, partKey){
        var m = cls.createEnchantMasterData({ cache:true })[enchantType];
        return partKey === 'weapon' && m.forWeapon || partKey === 'armor' && m.forArmor ||
            partKey === 'shield' && m.forShield || partKey === 'accessory' && m.forAccessory;
    };
    /** 部位を指定してランダム付与するエンチャント種別を比率を考慮して選ぶ */
    cls.randChoiceEnchant = function(partKey, tlv){
        var ratios = {};
        $f.each(cls.createEnchantMasterData({ cache:true }), function(k, v){
            var minTlv = v.options.minTlv || 0;
            if (cls._checkAttachableEnchant(k, partKey) && tlv >= minTlv) {
                ratios[k] = v.ratio;
            };
        });
        return $f.randRatioChoice(ratios);
    };

    cls.prototype.pickle = function(){
        var json = {
            pk: this.partKey,
            eq: this._equipmentType,
            sp: this._shapeType,
            mt: this._materialType,
            qu: this._quality,
            af: this._artifactId,
            enchants: {}
        };
        $f.each(this._enchants, function(k, v){
            json.enchants[k] = {
                power: v.power
            };
        });
        return json;
    };


    cls._factory = function(equipmentType, shapeType, materialType){
        var obj = new this();
        obj._equipmentType = equipmentType;
        obj._shapeType = shapeType;
        obj._materialType = materialType;
        __INITIALIZE(obj);
        return obj;
    };

    cls.factoryByUnpickle = function(json){
        var klass;
        if (json.pk === 'weapon') {
            klass = $a.$equipment.Weapon;
        } else if (json.pk === 'armor') {
            klass = $a.$equipment.Armor;
        } else if (json.pk === 'shield') {
            klass = $a.$equipment.Shield;
        } else if (json.pk === 'accessory') {
            klass = $a.$equipment.Accessory;
        };
        var obj = klass.factory(json.eq, json.sp, json.mt);
        obj.setQuality(json.qu);
        obj._artifactId = json.af || null;// null明示指定は過去ver互換用、後で消す
        obj.clearAllEnchants();
        $f.each(json.enchants, function(k, v){
            obj._setEnchant(k, v.power);
        });
        return obj;
    };

    /**
     * ランダム宝物として装備をひとつ生成する
     *
     * tlv num 1以上の宝物LV, 通常はDLVになる, 敵LVだとエゴで良い物が出過ぎるので止めた
     *         現在は 素材/エンチャ に関しては100LVが上限, 品質のみ100超に意味がある
     * options.bonusEnchantCount num 固定追加エンチャント数, 通常は0
     * options.partKey str 部位を指定, partMapを無効にする
     *                     equipmentTypeも指定する場合は合わせる必要有り
     * options.partMap obj 部位出現比率マップ
     * options.equipmentType str 装備種類を指定
     * options.artifactRate float AF化率, 通常は0.01
     * @return equipment
     */
    cls.factoryForTreasure = function(tlv, options){
        var self = this;
        var opts = options || {};

        var bonusEnchantCount = ('bonusEnchantCount' in opts)? opts.bonusEnchantCount: 0;
        var partKey = ('partKey' in opts)? opts.partKey: null;
        var partMap = opts.partMap;
        if (partMap === undefined) {
            partMap = {
                weapon: 4,
                armor: 2,
                shield: 1,
                accessory: 1
            };
        };
        var equipmentType = ('equipmentType' in opts)? opts.equipmentType: null;
        var artifactRate = ('artifactRate' in opts)? opts.artifactRate: 0.02;// 1%だと全然でなかった

        // 部位決定
        if (partKey === null) partKey = $f.randRatioChoice(partMap);
        // 部位に対応するサブクラスを取得
        var klass;
        if (partKey === 'weapon') {
            klass = $a.$equipment.Weapon;
        } else if (partKey === 'armor') {
            klass = $a.$equipment.Armor;
        } else if (partKey === 'shield') {
            klass = $a.$equipment.Shield;
        } else if (partKey === 'accessory') {
            klass = $a.$equipment.Accessory;
        };
        // 装備種類マスタデータ取得
        var mas = klass.createMasterData({ cache:true });
        // 装備種類・形状決定
        //! 出現率調整をする場合はキャッシュが壊れないように注意
        //  ここで非キャッシュを得ても戻り値はキャッシュとして参照されてるのでいじると壊れる
        if (equipmentType === null) {
            equipmentType = this._randChoiceEquipment(mas)[0];
        };
        shapeType = '0';// 現在は不使用で'0'固定
        // 素材決定
        var materialType = this._randChoiceMaterial(partKey, tlv);
        // 装備生成
        var eq = klass.factory(equipmentType, shapeType, materialType);
        // 品質設定
        if (partKey !== 'accessory') eq.setQuality(this._randQuality(tlv));
        // エンチャント数決定と付与
        var enchantCount = this._randCountEnchant(tlv) + bonusEnchantCount;
        $f.times(enchantCount, function(){
            var propType = self.randChoiceEnchant(partKey, tlv);
            eq.randSetEnchant(propType);
        });
        // AF化
        var artifactId = null;
        if (artifactRate > Math.random()) {
            artifactId = this._randArtifactId(equipmentType);
            if (artifactId !== null) {
                eq._artifactId = artifactId;
                eq._applyArtifactEnchants();
            };
        };
        return eq;
    };
    /** 素材を宝物LVを考慮してランダムに選択する
        今は 宝物LV/2(切上げ) 以下の素材から完全ランダム選択なので、99以上なら同じ
        @return str 素材タイプ */
    cls._randChoiceMaterial = function(partKey, tlv){
        var master = cls.createMaterialMasterData({ cache:true });
        var list = [];
        $f.each(master, function(k, v){
            if (
                v.lv <= Math.ceil(tlv / 2) && (
                    partKey === 'weapon' && v.forWeapon ||
                    partKey === 'armor' && v.forArmor ||
                    partKey === 'shield' && v.forShield ||
                    partKey === 'accessory'
                )
            ) list.push(v.materialType);
        });
        return $f.randChoice(list);
    };
    /** 品質を宝物LVからランダム算出する, 100超も有効 */
    cls._randQuality = function(tlv){
        if (0.5 < Math.random()) return 0; // 半分で無し
        return $f.randInt(1, Math.ceil(tlv / 2));
    };
    /** エンチャント数を宝物LVからランダム算出する, TLV=100 が最大値
        付与率は多過ぎると確認の手間が面倒になって嬉しさが減るので、少なくとも半分以下が良い */
    cls._randCountEnchant = function(tlv){
        var tlv = $f.withinNum(tlv, 1, 100);
        // 1つでも付与される率, 4-40%
        //    1 =  4.0%
        //   10 = 12.6%  60 = 30.9%
        //   20 = 17.8%  70 = 33.4%
        //   30 = 21.9%  80 = 35.7%
        //   40 = 25.2%  90 = 37.9%
        //   50 = 28.2% 100 = 40.0%
        var p = Math.sqrt(tlv * 16) / 100;
        if (p < Math.random()) return 0;
        // 個数算出, 通常は 1-2個 から 1-6個
        // 6個は超低確率で TLV=100 で1/600の確率
        var cnt = 0;
        var min = 1;
        var max = 2 + $f.randRound(tlv / 33);
        return $f.randInt(min, max);
    };

    return cls;
})();

/** 武器クラス */
$a.$equipment.Weapon = (function(){
    var cls = function(){
        this.partKey = 'weapon';
    };
    $f.inherit(cls, new $a.Equipment());

    /** 指定対象への特効効果を返す, @return 0=無し, 1-3=有り */
    cls.prototype.getSlayingPower = function(target){
        var self = this;
        // 種族無し、つまりプレイヤー相手に特効は無い
        if (target.race === null) return 0;
        // 最も効果の高い値を返す
        var pow = 0;
        $f.each($a.Race.getSlayers(), function(key, raceClassNames){
            if ($f.inArray(target.race.className, raceClassNames) === false) return;
            var p = self.getEnchantPower(key);
            if (p > pow) pow = p;
        });
        return pow;
    };

    /** 武器マスタデータを返す
        options.cache true=キャッシュが有ればそこから返す */
    cls.createMasterData = function(options){
        var opts = options || {};
        var cache = ('cache' in opts)? opts.cache: false;
        if (cache && arguments.callee.__cache !== undefined) {
            return arguments.callee.__cache;
        };
        var datas = {};
        $f.each(cls._masterData, function(idx, src){
            var data = {}, tmp;
            data.order = idx;
            tmp = src[0].split(',');
            data.equipmentType = tmp[0];
            data.label = tmp[1];
            data.ratio = src[1];
            // -- ここから他と違う --
            tmp = src[2].split(',');
            data.isTwohanded = tmp[0] === '2H';
            if (tmp[1] === 'L') {
                data.distance = 3;
            } else if (tmp[1] === 'M') {
                data.distance = 2;
            } else {
                data.distance = 1;
            }
            data.powerRate = parseInt(tmp[2]) / 100;
            data.hit = parseInt(tmp[3]);
            data.sizeRate = parseInt(tmp[4]) / 100;
            // -- ここまで --
            data.shapes = {};
            $f.each(src[3], function(nouse, _src){
                var _tmp = _src.split(':');
                data.shapes[_tmp[0]] = {
                    shapeName: _tmp[1],
                    katakanaName: _tmp[2]
                };
            });
            $a.Equipment._checkEquipmentMasterData(data);
            datas[data.equipmentType] = data;
        });
        return arguments.callee.__cache = datas;
    };
    // 下記攻撃力修正6=下記命中修正1 で調整している
    //   例えば LV50 が 素材25+品質25=50 の武器を持った場合
    //     攻撃＋スキル      = 100    * 10% = 10
    //     下記攻撃力修正10% = 素材25 * 10% = 2.5
    //   と 4:1 ということになり、命中＋は5% なので 8:1 になる
    //   それをベースに以下を考慮して 6:1 にした
    //   - 4:1 だと命中が低い武器が使い難かった
    //   - 素材は常に存在するが品質は1/2でしか存在しない
    //   - 実際は、LV＋武器が基本値でその後にスキル効果が乗算される
    //   - 攻撃力UPスキルは効率の良い物が他にもある
    //
    // 両手持ちは、上記分のボーナスを+10-15%、もしくは飛距離を与えるとする
    cls._masterData = [
        ['sword,剣', 1.0, '1H,S,100,+0,100%', ['0:剣:ソード']],
        ['sword2h,大剣', 0.4, '2H,S,140,+5,140%', ['0:大剣:グレートソード']],
        ['dagger,短剣', 1.0, '1H,S,50,+10,30%', ['0:ダガー:ダガー']],
        ['rapier,突剣', 0.4, '1H,S,70,+5,60%', ['0:レイピア:レイピア']],
        ['blade,曲刀', 0.4, '1H,S,90,+0,80%', ['0:曲刀:シミター']],
        ['axe,斧', 0.75, '1H,S,160,-10,120%', ['0:斧:アックス']],
        ['axe2h,戦斧', 0.25, '2H,S,190,-5,160%', ['0:戦斧:バトルアックス']],
        ['mace,鎚', 0.75, '1H,S,80,+0,100%', ['0:メイス:メイス']],
        ['spear,槍', 1.0, '2H,M,100,+0,120%', ['0:槍:スピア']],
        ['javelin,投槍', 0.2, '1H,L,80,-5,100%', ['0:投槍:ジャベリン']],
        ['poleweapon,矛槍', 0.5, '2H,M,130,-5,140%', ['0:矛槍:ハルバード']],
        ['bow,弓', 1.0, '2H,L,100,+0,60%', ['0:弓:ボウ']],
        ['crossbow,弩', 0.5, '2H,L,110,+0,120%', ['0:弩:クロスボウ']],
        ['sling,投石', 0.3, '1H,L,70,-10,40%', ['0:スリング:スリング']],
        ['dart,投矢', 0.2, '1H,L,10,+5,20%', ['0:投矢:ダート']],
        ['staff,杖', 0.75, '2H,M,50,+0,100%', ['0:杖:スタッフ']],
        ['wand,魔法棒', 0.5, '1H,S,10,+0,20%', ['0:ワンド:ワンド']],
        ['whip,鞭', 0.2, '1H,M,60,-5,50%', ['0:鞭:ウィップ']],
        ['katana,刀', 0.1, '1H,S,100,+5,80%', ['0:刀:カタナ']],
        ['katana2h,太刀', 0.05, '2H,S,140,+10,100%', ['0:太刀:ブレード']],
        ['ninjablade,忍刀', 0.1, '1H,S,80,+10,20%', ['0:忍刀:ニンジャブレード']],
        ['anki,暗器', 0.03, '1H,L,30,+20,5%', ['0:手裏剣:シュリケン']]//,
    ];


    cls.factory = function(/* args passing */){
        var obj = $a.Equipment._factory.apply(this, arguments);
        return obj;
    };

    return cls;
})();
/** 鎧クラス */
$a.$equipment.Armor = (function(){
    var cls = function(){
        this.partKey = 'armor';
    };
    $f.inherit(cls, new $a.Equipment());

    /** 鎧マスタデータを返す, !解説は同名の武器マスタデータ返却関数参照 */
    cls.createMasterData = function(options){
        var opts = options || {};
        var cache = ('cache' in opts)? opts.cache: false;
        if (cache && arguments.callee.__cache !== undefined) {
            return arguments.callee.__cache;
        };
        var datas = {};
        $f.each(cls._masterData, function(idx, src){
            var data = {}, tmp;
            data.order = idx;
            tmp = src[0].split(',');
            data.equipmentType = tmp[0];
            data.label = tmp[1];
            data.ratio = src[1];
            // -- ここから他と違う --
            tmp = src[2].split(',');
            data.powerRate = parseInt(tmp[0]) / 100;
            data.sizeRate = parseInt(tmp[1]) / 100;
            // -- ここまで --
            data.shapes = {};
            $f.each(src[3], function(nouse, _src){
                var _tmp = _src.split(':');
                data.shapes[_tmp[0]] = {
                    shapeName: _tmp[1],
                    katakanaName: _tmp[2]
                };
            });
            $a.Equipment._checkEquipmentMasterData(data);
            datas[data.equipmentType] = data;
        });
        return arguments.callee.__cache = datas;
    };
    // 服は素材が2wまで0wになるように調整, 衣は1wまで0w, 他種別は0w素材や軽量エンチャ必須
    cls._masterData = [
        ['cloth,服', 1.0, '25,17%', ['0:服:クロース']],
        ['robe,衣', 0.5, '25,25%', ['0:衣:ローブ']], // 素材に関わらず60%の魔法防御率保証
        ['lightarmor,軽鎧', 1.0, '50,50%', ['0:軽鎧:ライトアーマー']],
        ['chain,鎖帷子', 0.75, '75,75%', ['0:鎖帷子:チェイン']],
        ['armor,鎧', 1.0, '100,100%', ['0:鎧:アーマー']],
        ['platearmor,甲冑', 0.25, '150,150%', ['0:甲冑:プレート']]//,
    ];


    cls.factory = function(/* args passing */){
        var obj = $a.Equipment._factory.apply(this, arguments);
        return obj;
    };

    return cls;
})();
/** 盾クラス */
$a.$equipment.Shield = (function(){
    var cls = function(){
        this.partKey = 'shield';
    };
    $f.inherit(cls, new $a.Equipment());

    /** 盾マスタデータを返す, !解説は同名の武器マスタデータ返却関数参照 */
    cls.createMasterData = function(options){
        var opts = options || {};
        var cache = ('cache' in opts)? opts.cache: false;
        if (cache && arguments.callee.__cache !== undefined) {
            return arguments.callee.__cache;
        };
        var datas = {};
        $f.each(cls._masterData, function(idx, src){
            var data = {}, tmp;
            data.order = idx;
            tmp = src[0].split(',');
            data.equipmentType = tmp[0];
            data.label = tmp[1];
            data.ratio = src[1];
            // -- ここから他と違う --
            tmp = src[2].split(',');
            data.basePower = parseInt(tmp[0]);
            data.powerRate = parseInt(tmp[1]) / 100;
            data.maxPower = parseInt(tmp[2]);// 今はかなり余裕を取っているので実質無意味
            data.sizeRate = parseInt(tmp[3]) / 100;
            // -- ここまで --
            data.shapes = {};
            $f.each(src[3], function(nouse, _src){
                var _tmp = _src.split(':');
                data.shapes[_tmp[0]] = {
                    shapeName: _tmp[1],
                    katakanaName: _tmp[2]
                };
            });
            $a.Equipment._checkEquipmentMasterData(data);
            datas[data.equipmentType] = data;
        });
        return arguments.callee.__cache = datas;
    };
    cls._masterData = [
        //! 使う人の割合に合って無いけど、小盾が多過ぎると面白くないのでこの程度にする
        ['smallshield,小盾', 1.0, '3,15%,33,50%', ['0:小盾:スモールシールド']],
        ['shield,盾',        0.5, '4,20%,50,100%', ['0:盾:シールド']],
        ['largeshield,大盾', 0.25, '5,25%,99,120%', ['0:大盾:ラージシールド']]//,
    ];


    cls.factory = function(/* args passing */){
        var obj = $a.Equipment._factory.apply(this, arguments);
        return obj;
    };

    return cls;
})();
/** 装飾品クラス */
$a.$equipment.Accessory = (function(){
    var cls = function(){
        this.partKey = 'accessory';
    };
    $f.inherit(cls, new $a.Equipment());

    function __INITIALIZE(self){
        // 基本能力値上昇を必ず得る
        var baseParameterName = $f.randChoice($a.Character.baseParameterNames);
        self.randSetEnchant(baseParameterName);
    };

    /** 装飾品マスタデータを返す, !解説は同名の武器マスタデータ返却関数参照 */
    cls.createMasterData = function(options){
        var opts = options || {};
        var cache = ('cache' in opts)? opts.cache: false;
        if (cache && arguments.callee.__cache !== undefined) {
            return arguments.callee.__cache;
        };
        var datas = {};
        $f.each(cls._masterData, function(idx, src){
            var data = {}, tmp;
            data.order = idx;
            tmp = src[0].split(',');
            data.equipmentType = tmp[0];
            data.label = tmp[1];
            data.ratio = src[1];
            // -- ここから他と違う --
            tmp = src[2].split(',');
            data.powerRate = 1.0; // 実質使わない
            data.sizeRate = parseInt(tmp[0]) / 100;
            // 美術的価値の増幅係数, 服飾・装飾品は高い, 0-10
            data.artisticValueRate = parseInt(tmp[1]);
            // -- ここまで --
            data.shapes = {};
            $f.each(src[3], function(nouse, _src){
                var _tmp = _src.split(':');
                data.shapes[_tmp[0]] = {
                    shapeName: _tmp[1],
                    katakanaName: _tmp[2]
                };
            });
            $a.Equipment._checkEquipmentMasterData(data);
            datas[data.equipmentType] = data;
        });
        return arguments.callee.__cache = datas;
    };
    cls._masterData = [
        ['ring,指輪', 1.0, '1%,2', ['0:指輪:リング']],
        ['bracelet,腕輪', 1.0, '10%,2', ['0:腕輪:ブレスレット']],
        ['necklace,首飾り', 1.0, '10%,2', ['0:首飾り:ネックレス']],
        ['amulet,護符', 1.0, '1%,1', ['0:護符:アミュレット']],
        ['talisman,呪符', 0.5, '1%,0', ['0:呪符:タリスマン']],
        ['emblem,紋章', 0.5, '1%,1', ['0:紋章:エンブレム']],
        ['stone,宝玉', 0.5, '10%,1', ['0:宝玉:ストーン']],
        ['ball,玉', 0.25, '20%,1', ['0:玉:ボール']],
        ['mirror,鏡', 0.25, '25%,1', ['0:鏡:ミラー']],
        ['goblet,杯', 0.25, '15%,1', ['0:杯:ゴブレット']],
        ['gloves,手袋', 1.0, '25%,1', ['0:手袋:グローブ']],
        ['gauntlets,小手', 1.0, '50%,0', ['0:小手:ガントレット']],
        ['boots,靴', 1.0, '25%,1', ['0:靴:ブーツ']],
        ['leggings,足当て', 1.0, '50%,0', ['0:足当て:レギングス']],
        ['hat,帽子', 1.0, '25%,1', ['0:帽子:ハット']],
        ['helmet,兜', 1.0, '50%,0', ['0:兜:ヘルム']],
        ['crown,冠', 0.25, '30%,3', ['0:冠:クラウン']],
        ['cloak,外套', 1.0, '60%,1', ['0:外套:クローク']],
        ['statue,彫像', 0.05, '200%,5', ['0:彫像:スタチュー']],
        ['rubbish,がらくた', 1.0, '20%,0', ['0:がらくた:ジャンク']]//,
    ];


    cls.factory = function(/* args passing */){
        var obj = $a.Equipment._factory.apply(this, arguments);
        __INITIALIZE(obj);
        return obj;
    };

    return cls;
})();


/** Equipmentクラスのアーティファクト関係 */
$a.Equipment.artifacts = (function(){

var arties = {};

//! '/'(半角スラッシュ)もカンマと同じ意味のセパレータなので注意, 見易さで使い分けているだけ
//! 武器の場合は攻撃値が、鎧の場合は防御値が、それぞれ後で形状の影響を受けるので注意
//- 出現比率(ratio)は金額計算にも使っている。ただし、現在のところは特に値に制限が出てはいない
var rawDataList = [

    // 剣, R10に魔剣士用の剣が1つ欲しい
    ['11100,sword,1,エクスカリバー,40/0,0/0,0/0,0/25,5/5', { strength:3, vitality:3, will:3,
        vsevil:2, vshuman:2, hpregeneration:5 }, { ProtectSkill:1 }],
    ['11200,sword,1,名も無き勇者の剣,30/0,0/0,0/0,0/0,0/0', { strength:3, vitality:3, skillfulness:3,
        quickness:3, magic:3, will:3, wisdom:3, vsevil:2, vsdragon:2 }, {}],
    //['11300,sword,1,妖剣ベルサスネーガ,30/30,0/0,0/0,0/0,0/0', { magic:3, will:5, vshuman:2,
    //    hpregeneration:10, magicinclusion:2 }, { PermanentcurseSkill:1 }],
    ['15100,sword,5,ライトセーバー,70/0,0/0,0/0,0/0,0/0', { will:2, resistanceblindness:1,
        lightweight:5 }, {}],
    ['15200,sword,5,草薙之剣,20/0,0/0,0/0,0/0,0/0', { will:3, wisdom:3, vsevil:1, vsdragon:3,
        avoidanceboost:2, resistancesleep:1 }, { StealthSkill:1 }],
    ['15300,sword,5,カラドボルグ,40/0,0/0,0/0,0/0,0/0', { strength:2, rangeboost:2, criticalhitboost:2 }, {}],
    ['15400,sword,5,カエルソード,30/0,30/0,0/0,0/0,0/0', { will:5, criticalhitboost:5, magicinclusion:1 }, {}],
    ['19100,sword,10,ロングソード＋１,25/0,0/0,10/0,0/0,0/0', { strength:1, skillfulness:1 }, {}],
    ['19200,sword,10,隼の剣,-25/0,0/0,0/0,0/0,0/0', { skillfulness:2, comboboost:2, lightweight:5 },
        { ComboattackSkill:1 }],
    ['19300,sword,10,アゾット剣,0/0,0/0,0/0,0/0,0/0', { vitality:1, wisdom:1, hpregeneration:2,
        mpregeneration:2, magicinclusion:1 }, { DivineGraceSkill:1, PurifySkill:1 }],

    // 大剣
    ['21100,sword2h,1,ドラゴン殺し,50/0,0/0,0/0,0/0,0/0', { strength:5, will:3,
        vsevil:2, vshuman:2, vselement:2, vsbeast:2, vsdragon:2, vsgiant:2, vsgod:3, heavyweight:2 },
        { GutsSkill:1, BerserkSkill:1 }],
    ['25100,sword2h,5,グラム,25/0,0/0,0/0,0/0,0/0', { strength:2, vitality:2, skillfulness:2,
        quickness:2, magic:2, will:2, wisdom:2, vsdragon:3 }, {}],
    ['25200,sword2h,5,アイスソード,50/0,50/0,0/0,0/0,0/0', { strength:3, magic:3,
        procparalysis:2, magicinclusion:2 }, {}],
    ['25300,sword2h,5,七支刀,10/0,25/0,0/0,0/0,0/0', { magic:1, vsgod:2, rangeboost:2, comboboost:1,
        magicinclusion:1 }, { MagicswordSkill:1 }],
    ['25400,sword2h,5,ハマノツルギ,20/0,-999/100,0/0,0/0,0/25', { will:2 }, {}],
    ['29100,sword2h,10,チェーンソー,50/0,0/0,-15/0,0/0,0/0', { strength:2, vshuman:2, vsgod:2 }, {}],
    ['29200,sword2h,10,モンスターハンター,20/0,0/0,0/0,0/0,0/0', { strength:1, skillfulness:1,
        vsbeast:2, vsdragon:2, proctumble:1 }, {}],
    ['29300,sword2h,10,マテリアブレード,10/0,25/0,0/0,0/0,0/0', { magic:3, magicinclusion:2 },
        { MagicalattackallSkill:1 }],

    // 短剣, R5を+1する, 候補) 短剣ロワイヤルなどソシャゲタイトル
    ['31100,dagger,1,ウルヴァリン,40/0,0/0,0/0,0/0,0/0', { strength:4, vitality:4,
        skillfulness:4, quickness:4, comboboost:1, hpregeneration:5, speedboost:2, lightweight:5 }, {}],
    ['31200,dagger,1,盗賊の短刀,40/0,0/0,0/0,0/0,0/0', { skillfulness:3, quickness:5, avoidanceboost:5,
        lightweight:2 }, { AssassinateSkill:1, StealthSkill:1, PreemptiveAttackSkill:1 }],
    ['35100,dagger,5,運命のダガー,100/0,0/0,0/0,0/0,0/0', { will:5, vsdragon:3, vsgod:3 }, {}],
    ['35200,dagger,5,壊れないロックピック,-999/0,0/0,0/0,0/0,0/0', { skillfulness:5, wisdom:3,
        lightweight:5 }, { UnlockSkill:3, MagicalkeySkill:1 }],
    ['35300,dagger,5,早業の短刀,25/0,0/0,0/0,0/0,0/0', { skillfulness:3, quickness:2, comboboost:2,
        lightweight:5 }, { ComboattackSkill:1 }],
    ['39100,dagger,10,人魚姫の短剣,0/0,0/0,0/0,0/0,0/0', { will:3, procsleep:1, procparalysis:1,
        procblindness:1, proctumble:1, procsrip:1 }, {}],
    ['39200,dagger,10,切り裂きジャックのダガー,25/0,0/0,0/0,0/0,0/0', { quickness:1, vshuman:3,
        procparalysis:2 }, { StealthSkill:1 }],
    ['39300,dagger,10,クリス・ナイフ,0/0,10/10,0/0,0/25,0/0', { magic:2, mpregeneration:1 }, {}],
    ['39400,dagger,10,スペツナズ・ナイフ,25/0,0/0,10/0,0/0,0/0', { skillfulness:1, distanceboost:2,
        criticalhitboost:1 }, { PreemptiveAttackSkill:1 }],
    ['39500,dagger,10,マン・ゴーシュ,0/0,0/0,0/0,0/0,15/0', { vitality:1, lightweight:1 },
        { ParrySkill:1 }],

    // レイピア
    ['41100,rapier,1,銀の戦車,40/0,0/0,0/0,0/0,0/0', { skillfulness:5, will:3,
        vsevil:3, vshuman:2, comboboost:2, speedboost:2, lightweight:1 }, {}],
    ['45100,rapier,5,軍神マルスのレイピア,25/0,0/0,0/0,0/0,0/0', { skillfulness:2, wisdom:2,
        vshuman:2, vsdragon:2, criticalhitboost:2 }, { EliteSkill:1, GeneralshipSkill:1 }],
    ['49100,rapier,10,マタドール,0/0,0/0,0/0,0/0,10/0', { skillfulness:1, vsbeast:2 },
        { ParrySkill:1, CounterattackSkill:1 }],
    ['49200,rapier,10,シルフのレイピア,15/15,0/0,0/0,0/0,10/0', { quickness:3, avoidanceboost:3,
        magicinclusion:1 }, {}],

    // 曲刀
    ['51100,blade,1,ドレーク船長の海賊刀,40/0,0/0,0/0,0/0,0/0', { will:3, wisdom:5 },
        { WordofcommandSkill:1, GeneralshipSkill:2, PreemptiveAttackSkill:2 }],
    ['55100,blade,5,砂塵のシミター,50/0,0/0,0/0,0/0,0/0', { strength:4, quickness:4, will:4,
        vsdragon:1, resistanceblindness:1 }, {}],
    ['59100,blade,10,踊り子の曲刀,10/0,0/0,0/25,0/0,0/0', { quickness:1, procsleep:1 }, {}],
    ['59200,blade,10,肉切り包丁,-10/0,0/0,0/0,0/0,0/0', { vitality:1, vshuman:2, vsbeast:3,
        vsdragon:2, vsgiant:2, criticalhitboost:2 }, {}],

    // 斧
    ['61100,axe,1,魔神の斧,40/0,0/0,0/0,0/0,0/0', { strength:5, criticalhitboost:10, heavyweight:3 },
        { StrengthattackSkill:1 }],
    ['61200,axe,1,憤怒の狂戦士の黒い斧,40/0,0/0,0/0,0/0,0/12', { strength:3, vitality:2, rangeboost:2,
        vshuman:2, magicinclusion:1 }, { CounterattackSkill:1, BerserkSkill:1 }],
    ['65100,axe,5,速きナブラの斧,50/0,0/0,0/0,0/0,0/0', { quickness:5, speedboost:3, lightweight:2 }, {}],
    ['65200,axe,5,勇者の斧,25/0,0/0,0/0,0/0,0/0', { strength:2, vitality:2, comboboost:1 },
        { EliteSkill:1, PreemptiveAttackSkill:1 }],
    ['65300,axe,5,鉄巨人の手投斧,40/0,0/0,0/0,0/0,0/0', { vitality:5, vsevil:2, vsdragon:3,
        distanceboost:2 }, { MagicalbreathSkill:1 }],
    ['69100,axe,10,ミノタウロスの斧,25/0,0/0,0/0,0/0,0/0', { strength:2, criticalhitboost:2 }, {}],
    ['69200,axe,10,蟷螂の斧,10/0,0/0,0/0,0/0,0/0', { will:2, comboboost:1, lightweight:2 },
        { BerserkSkill:1 }],
    ['69300,axe,10,正直者の金の斧,0/0,0/0,0/0,0/0,0/0', { wisdom:3, vselement:1, heavyweight:2 },
        { LuckSkill:1 }],
    ['69400,axe,10,与作の鉞,10/10,0/0,0/0,0/0,0/0', { vitality:4 }, {}],

    // 戦斧
    ['71100,axe2h,1,ゴールデンアックス,30/20,30/20,0/0,0/0,0/0', { strength:3, magic:3,
        mpregeneration:2, magicinclusion:2, heavyweight:1 }, { MagicswordSkill:1, MagicalattackallSkill:1 }],
    ['75100,axe2h,5,地獄のギロチン・アックス,35/0,0/0,0/0,0/0,0/0', { strength:2, skillfulness:2,
        quickness:2, vshuman:3, vsgiant:2, procparalysis:2 }, {}],
    ['75200,axe2h,5,巨人の斧,50/0,0/0,-10/0,0/0,0/0', { strength:5, vitality:5, hpregeneration:2,
        heavyweight:2 }, { BoosthpbyvitalitySkill:1 }],
    ['79100,axe2h,10,山ドワーフの戦斧,40/0,0/0,0/0,0/0,0/0', { strength:1, vitality:2,
        vsevil:2, vsgiant:1, resistanceblindness:1 }, {}],
    ['79200,axe2h,10,獣王の大斧,15/0,0/0,0/0,0/0,0/0', { vitality:2, vsbeast:3, rangeboost:1,
        hpregeneration:2, magicinclusion:1 }, { GutsSkill:1 }],

    // メイス
    ['81100,mace,1,ミョルニル,50/0,25/0,25/0,0/0,0/0', { strength:5, vsgiant:3, vsgod:2, distanceboost:2,
        magicinclusion:1, heavyweight:2 }, { HeavyequipmentSkill:1 }],
    ['85100,mace,5,ガッツのバット,30/0,0/0,0/0,0/0,0/0', { vitality:3, will:5, wisdom:3,
        criticalhitboost:2 }, { GutsSkill:1 }],
    ['85200,mace,5,破壊の鉄球,50/0,0/0,0/0,0/0,0/0', { strength:3, rangeboost:2,
        procsrip:3, heavyweight:1 }, {}],
    ['85300,mace,5,名状しがたいバール,55/0,0/0,0/0,0/0,0/0', { strength:3, vsevil:3, vsgod:3,
        criticalhitboost:2 }, {}],
    ['89100,mace,10,祝福のメイス,10/0,0/10,0/0,0/10,0/0', { wisdom:2, vsevil:2, mpregeneration:1,
        resistanceparalysis:1 }, {}],
    ['89200,mace,10,神通棍,20/0,20/0,0/0,0/0,0/0', { magic:2, vsevil:3, magicinclusion:1 }, {}],
    ['89300,mace,10,ピコピコハンマー,-999/0,0/0,0/0,25/0,0/0', { magic:1, rangeboost:1, procsleep:3,
        lightweight:2 }, {}],
    ['89400,mace,10,びっくり鈍器,25/0,0/0,0/0,0/0,0/0', { will:3, proctumble:3 }, {}],

    // 槍
    ['91100,spear,1,グングニル,35/0,35/0,25/0,0/0,0/0', { wisdom:5, vsbeast:3, vsgiant:3, vsgod:2,
        distanceboost:2, magicinclusion:1 }, { GeneralshipSkill:1 }],
    ['95100,spear,5,ロンギヌスの槍,25/0,0/0,0/0,0/0,0/0', { wisdom:3, will:3, vshuman:2, vsgod:2,
        hpregeneration:3, resistanceparalysis:1 }, {}],
    ['95200,spear,5,獣の槍,30/0,0/0,0/0,0/0,0/0', { strength:2, vitality:2, skillfulness:2, quickness:2,
        vsbeast:3, vselement:3, hpregeneration:3 }, {}],
    ['95300,spear,5,蜻蛉切,55/0,0/0,0/0,0/0,0/0', { strength:3, skillfulness:3, vshuman:2,
        criticalhitboost:2 }, {}],
    ['95400,spear,5,フリーランス,25/0,0/0,0/0,0/0,0/0', { strength:2, vitality:2, skillfulness:2,
        quickness:2, magic:2, will:2, wisdom:2 }, { SecureretreatSkill:1, AvoidtrapSkill:1 }],
    ['99100,spear,10,聖ゲオルギウスの槍,10/0,0/0,0/0,0/0,0/0', { will:2, vsevil:1, vsdragon:3 }, {}],
    ['99200,spear,10,守り人の短槍,15/0,0/0,0/0,0/0,0/0', { will:1, wisdom:2, vshuman:1, vselement:1 },
        { ProtectSkill:1, DetecttrapSkill:1 }],
    ['99300,spear,10,ようせいの槍,0/0,0/0,0/0,0/0,0/0', { strength:3, skillfulness:3, quickness:3 }, {}],
    ['99400,spear,10,鎧の魔槍,15/15,15/15,0/0,0/0,0/0', { vitality:1, magic:1, magicinclusion:1 }, {}],
    ['99500,spear,10,ファランクス,0/25,0/0,0/0,0/0,10/0', { vitality:2 }, {}],

    // 投槍
    ['101100,javelin,1,ゲイボルグ,50/0,0/0,55/0,0/0,0/0', { strength:3, skillfulness:3,
        rangeboost:2, criticalhitboost:3, heavyweight:1 }, {}],
    ['105100,javelin,5,ミストルティン,30/0,0/0,0/0,0/0,0/0', { skillfulness:5, vsgod:3, criticalhitboost:2,
        procblindness:3, resistanceblindness:1, lightweight:1 }, { PreemptiveAttackSkill:1 }],
    ['105200,javelin,5,ヴァルキリー・ジャベリン,0/0,50/0,30/0,0/0,0/0', { magic:3,
        magicinclusion:2, lightweight:5 }, { MagicswordSkill:1, MagicalattackSkill:1 }],
    ['109100,javelin,10,パトリオット,0/0,0/0,0/0,0/0,10/10', { skillfulness:1 }, {}],
    ['109200,javelin,10,五輪の投槍,25/0,0/0,0/0,0/0,0/0', { strength:1, vitality:1, skillfulness:1,
        quickness:1, will:1 }, {}],

    // 矛槍
    ['111100,poleweapon,1,天沼矛,0/0,25/25,0/0,0/0,0/0', { vitality:5, wisdom:3, hpregeneration:3,
        mpregeneration:2, resistancesleep:1, resistanceparalysis:1, resistanceblindness:1 },
        { PraySkill:1, ResuscitationSkill:1 }],
    ['115100,poleweapon,5,方天画戟,50/0,0/0,0/0,0/0,0/0', { strength:5, vitality:3, skillfulness:3,
        heavyweight:1 }, { BerserkSkill:1 }],
    ['115200,poleweapon,5,バルディッシュ,20/0,40/0,0/0,0/0,0/0', { magic:4, wisdom:2,
        magicinclusion:2 }, { MagicalattackSkill:1, MagicalattackallSkill:1, MagicswordSkill:1 }],
    ['119100,poleweapon,10,シルバーバンク・ハルバード,35/0,0/0,0/0,0/0,0/0', { strength:2, vsevil:2 },
        {}],
    ['119200,poleweapon,10,矛盾,20/20,0/0,0/0,0/0,5/0', { strength:1, vitality:1 }, {}],
    ['119300,poleweapon,10,巴御前の赤薙刀,25/0,0/0,0/0,0/0,0/0', { will:3, resistancesleep:1 },
        { ProtectSkill:1 }],

    // 弓, 候補)サジタリウス(射手座,聖闘士聖矢)
    ['121100,bow,1,桃色女神の光の弓,20/0,20/0,0/0,0/0,0/0', { magic:3, will:3, wisdom:3, vsevil:3,
        vsbeast:2, vsgod:1, rangeboost:2, mpregeneration:2, magicinclusion:2 },
        { ResuscitationSkill:1, PurifySkill:1, LuckSkill:1 }],
    ['121200,bow,1,ドワーフ王の黒い弓,50/0,0/0,10/0,0/0,0/0', { strength:3, vitality:3, skillfulness:5,
        vsdragon:3, criticalhitboost:2, resistanceblindness:1 }, {}],
    ['125100,bow,5,アルテミスの弓,25/0,0/0,0/0,0/0,0/0', { skillfulness:3, wisdom:3,
        vshuman:2, vsbeast:2, magicinclusion:1 }, { DetecttrapSkill:1, PreemptiveAttackSkill:1 }],
    ['125200,bow,5,雷神の弓,60/0,20/0,0/0,0/0,0/0', { strength:4, skillfulness:4,
        magicinclusion:1 }, {}],
    ['125300,bow,5,ホークアイ,30/0,0/0,0/0,0/0,0/0', { skillfulness:5, will:3,
        comboboost:2, distanceboost:2 }, {}],
    ['125400,bow,5,キラーボウ,20/0,0/0,0/0,0/0,0/0', { skillfulness:3,
        criticalhitboost:10, lightweight:1 }, {}],
    ['129100,bow,10,闇の森のエルフの弓,20/0,0/0,10/0,0/0,0/0', { skillfulness:2, quickness:1,
        vsevil:2, vsgiant:1, resistancesleep:1 }, {}],
    ['129200,bow,10,ロビン・フットの短弓,5/0,0/0,0/0,0/0,0/0', { quickness:2, procsleep:2,
        avoidanceboost:2, lightweight:3 }, { StealthSkill:1 }],
    ['129300,bow,10,梓弓,20/0,0/0,0/0,0/0,0/0', { wisdom:2, vsevil:2, mpregeneration:1,
        resistanceparalysis:1 }, {}],
    ['129400,bow,10,ウェールズ産の長弓,30/0,0/0,0/0,0/0,0/0', { skillfulness:3, distanceboost:1 },
        { PreemptiveAttackSkill:1 }],

    // 弩
    ['131100,crossbow,1,アーバレストＭ９,50/50,0/0,0/0,0/0,10/0', { vitality:5, will:3 },
        { DefensemasterySkill:1, DefenseenhancementSkill:1 }],
    ['135100,crossbow,5,スナイパー,30/0,0/0,0/0,0/0,0/0', { skillfulness:5, distanceboost:2,
        vshuman:2, criticalhitboost:2 }, { PreemptiveAttackSkill:1, StealthSkill:1 }],
    ['135200,crossbow,5,サブマシンガン,25/0,0/0,0/0,0/0,0/0', { quickness:2, rangeboost:1,
        comboboost:4 }, {}],
    ['139100,crossbow,10,ウィリアム・テルの弩,10/0,0/0,50/0,0/0,0/0', { skillfulness:3 }, {}],
    ['139200,crossbow,10,クレインクイン,60/0,0/0,0/0,0/0,0/0', { heavyweight:2 }, {}],

    // 投石
    ['141100,sling,1,魔弾タスラム,50/0,0/0,0/0,0/50,0/0', { skillfulness:3, will:5,
        vsgiant:3, vsgod:3, procblindness:3 }, {}],
    ['145100,sling,5,手榴弾,100/0,0/0,0/0,0/0,0/0', { skillfulness:2, rangeboost:2 }, {}],
    ['145200,sling,5,平次の投げ銭,10/0,0/0,0/0,0/0,0/0', { skillfulness:2, will:3,
        vsevil:2, vshuman:2, proctumble:2, procsrip:2, lightweight:5 }, {}],
    ['149100,sling,10,漬物石,0/0,0/0,0/0,0/0,0/0', { strength:3, heavyweight:3 }, {
        HeavyequipmentSkill:1, StrengthattackSkill:1 }],
    ['149200,sling,10,煙玉,-999/0,-999/0,20/0,10/0,0/0', { quickness:2, rangeboost:2, procblindness:3,
        lightweight:2 }, {}],

    // 投矢
    ['151100,dart,1,時の支配者の投げナイフ,0/0,0/0,0/0,0/0,0/0', { skillfulness:3, rangeboost:2,
        comboboost:4, distanceboost:2, speedboost:5, lightweight:5 }, { PreemptiveAttackSkill:1 }],
    ['155100,dart,5,チャレンジャー,25/0,0/0,0/0,0/0,0/0', { skillfulness:3, quickness:3, wisdom:3,
        comboboost:1, lightweight:2 }, { AvoidtrapSkill:1, DetecttrapSkill:1 }],
    ['155200,dart,5,麻酔注射器,-999/0,0/0,0/0,25/0,0/0', { vitality:2, vshuman:2,
        procsleep:3, procparalysis:3 }, {}],
    ['159100,dart,10,銀のダーツ,25/0,0/0,10/0,0/0,0/0', { will:2, vsevil:3 }, {}],
    ['159200,dart,10,怪盗の予告状,0/0,0/0,0/0,0/0,0/0', { skillfulness:2, quickness:2 },
        { UnlockSkill:1, StealthSkill:1 }],

    // 杖
    ['161100,staff,1,白き魔王の魔砲杖,0/0,150/0,0/0,0/0,0/0', { magic:5, wisdom:2,
        magicinclusion:2 }, {}],
    ['161200,staff,1,冥王の破壊の大鉄杖,50/0,25/0,0/0,0/0,0/0', { strength:5, magic:3,
        rangeboost:2, vshuman:2, vsgod:2, proctumble:2, procsrip:2, heavyweight:2 }, {}],
    ['165100,staff,5,ドラゴンの杖,20/0,40/0,0/0,0/0,0/0', { vitality:5, magic:3, vsdragon:2,
        hpregeneration:3, mpregeneration:2, magicinclusion:1 },
        { MagicalbreathSkill:1, Magicalbreath2Skill:1, Magicalbreath3Skill:1 }],
    ['165200,staff,5,賢者の杖,0/0,25/25,0/0,0/0,0/0', { wisdom:5, will:3, magicinclusion:2,
        mpregeneration:5, lightweight:1 }, { DivineGraceSkill:1, PraySkill:1 }],
    ['165300,staff,5,孫悟空の如意棒,30/0,0/0,0/0,0/0,0/0', { strength:3, vitality:3, quickness:3,
        vsevil:1, vselement:1, vsgod:1, distanceboost:1 }, {}],
    ['169100,staff,10,アスクレピオスの杖,0/0,0/0,0/0,0/0,0/0', { skillfulness:2, vitality:2, wisdom:2,
        resistanceparalysis:1 }, { FirstaidSkill:1 }],
    ['169200,staff,10,いかづちの杖,0/0,25/0,0/0,0/0,0/0', { magic:3, magicinclusion:1 },
        { MagicalattackallSkill:1 }],
    ['169300,staff,10,ハートの女王の王錫,0/0,0/0,0/0,0/0,0/0', { will:3 },
        { EliteSkill:1, WordofcommandSkill:1 }],
    ['169400,staff,10,老魔法使いの古びた杖,0/0,0/15,0/0,0/0,0/0', { magic:1, will:1, wisdom:1,
        mpregeneration:2, lightweight:1 }, { MagicalattackSkill:1, SleepSkill:1 }],

    // ワンド
    ['171100,wand,1,エルダーワンド,0/0,50/0,0/0,0/0,0/0', { magic:5, will:5, wisdom:5,
        mpregeneration:3, magicinclusion:2, speedboost:2, lightweight:1 }, {}],
    ['175100,wand,5,ウィザードロッド,0/0,50/0,0/0,0/0,0/0', { magic:3, vsevil:2, vshuman:2,
        vsbeast:2, vselement:2, magicinclusion:2, lightweight:2 }, {}],
    ['175200,wand,5,ロケットの魔法棒,0/0,30/0,0/0,0/0,0/0', { magic:2, rangeboost:1, distanceboost:2,
        speedboost:2, lightweight:2 }, { MagicswordSkill:1, PreemptiveAttackSkill:1 }],
    ['179100,wand,10,マジックハンド,0/0,0/0,0/0,0/0,0/0', { skillfulness:1, distanceboost:2,
        proctumble:3, lightweight:1 }, { MagicswordSkill:1, PreemptiveAttackSkill:1 }],
    ['179200,wand,10,魔法少女の変身ステッキ,0/0,10/0,0/0,0/0,0/0', { magic:1, will:2,
        magicinclusion:1, lightweight:1 },
        { LuckSkill:1, SpeedenhancementSkill:1 }],

    // 鞭
    ['181100,whip,1,打神鞭,0/0,0/0,0/0,25/0,0/0', { will:5, wisdom:3, vsgod:3,
        procsleep:3, proctumble:3 }, {}],
    ['185100,whip,5,蛸足八本,25/0,0/0,-15/0,0/0,0/0', { vitality:3, comboboost:7, procparalysis:1 }, {}],
    ['185200,whip,5,銀狼妖狐の茨の鞭,25/0,0/0,0/0,0/0,0/0', { skillfulness:3, quickness:3, wisdom:3,
        rangeboost:1 }, { DetecttrapSkill:1 }],
    ['189100,whip,10,考古学者の鞭,0/0,0/0,0/0,0/0,0/0', { wisdom:3, proctumble:2 },
        { DetecttrapSkill:1, MagicalkeySkill:1 }],
    ['189200,whip,10,新体操のリボン,-999/0,0/0,0/0,0/0,0/0', { skillfulness:2, quickness:2,
        procparalysis:3, proctumble:1 }, {}],

    // 刀
    ['191100,katana,1,正宗,45/0,0/0,15/0,0/0,0/0', { strength:3, skillfulness:3, will:5,
        vsevil:2 }, {}],
    ['195100,katana,5,斬鉄剣,25/0,0/0,0/0,0/0,5/0', { skillfulness:3, quickness:2, will:3,
        comboboost:2 }, {}],
    ['199100,katana,10,名刀竹光,-999/0,0/0,20/0,0/0,0/0', { skillfulness:2, procsrip:2,
        speedboost:1, lightweight:5 }, { ComboattackSkill:1 }],

    // 太刀
    ['201100,katana2h,1,村正,75/0,0/0,0/0,0/0,0/0', { strength:4, skillfulness:4, vshuman:3,
        criticalhitboost:2, magicinclusion:1 }, { AttackupSkill:1 }],
    ['205100,katana2h,1,物干し竿,50/0,0/0,10/0,0/0,0/0', { strength:3, will:5,
        distanceboost:1 }, { IaiSkill:1 }],
    ['209100,katana2h,1,斬馬刀,10/25,0/0,0/0,0/0,5/0', { vitality:3 }, {}],

    // 忍刀
    ['211100,ninjablade,1,無手の刃,0/0,0/0,0/0,0/0,8/0', { quickness:5, avoidanceboost:5,
        lightweight:5 }, { ComboattackSkill:1, ParrySkill:2, CounterattackSkill:1 }],
    ['219100,ninjablade,10,カムイの忍刀,10/0,0/0,0/0,0/0,0/0', { quickness:2, procparalysis:2,
        speedboost:1, lightweight:2 }, { StealthSkill:1 }],

    // 暗器
    ['221100,anki,1,手裏剣,100/0,0/0,0/0,0/0,0/0', { skillfulness:5, quickness:5,
        resistancesleep:1, resistancesleep:1, resistanceblindness:1, lightweight:2 },
            { AssassinateSkill:1, StealthSkill:1, MaxhpupSkill:1 }],
    ['229100,anki,10,弥七の風車,0/0,0/0,0/0,0/0,0/0', { quickness:3, avoidanceboost:3,
        lightweight:2 }, { EmergencyescapeSkill:1 }],

    // 服
    ['1011100,cloth,1,ヒーロースーツ,0/0,0/0,0/0,0/0,0/0', { strength:2, vitality:2, skillfulness:2,
        quickness:2, magic:2, will:2, wisdom:2 }, { ProtectSkill:1 }],
    ['1011200,cloth,1,黒装束,0/0,0/0,0/0,0/0,0/0', { quickness:5, avoidanceboost:5, lightweight:5 },
        { StealthSkill:1 }],
    ['1011300,cloth,1,シルバースキン,0/50,0/25,0/0,0/0,10/5', {}, {}],
    ['1019100,cloth,10,王様の見えない服,0/-999,0/0,0/0,0/25,0/0', { will:5, lightweight:5 },
        { EliteSkill:1 }],
    ['1019200,cloth,10,力だすき,25/0,0/0,0/0,0/0,0/0', { strength:5, lightweight:2 }, {}],
    ['1019300,cloth,10,全身タイツ,0/0,0/0,0/0,25/0,0/0', { vitality:2 }, { ParalysisallSkill:1 }],
    ['1019400,cloth,10,スライムスキン,0/0,0/0,0/0,0/0,0/0', { hpregeneration:20 }, {}],

    // 衣
    ['1021100,robe,1,魔女グリンダの純白のドレス,0/0,50/0,0/0,0/0,0/0', { magic:5, will:3, wisdom:3,
        mpregeneration:3, magicinclusion:2 }, {}],
    ['1021200,robe,1,宵闇のローブ,0/50,0/0,0/0,0/0,10/0', { will:5, hpregeneration:3,
        resistancesleep:1, resistanceparalysis:1 }, { ProcparalysisSkill:1, StealthSkill:1 }],
    ['1021300,robe,1,聖拳士の闘衣,50/0,0/0,0/0,0/0,0/0', { strength:3, skillfulness:3, speedboost:2,
        lightweight:5 }, {}],
    ['1021400,robe,1,天女の羽衣,0/0,0/0,0/50,0/0,0/0', { speedboost:5, lightweight:5 },
        { EmergencyescapeSkill:1 }],
    ['1029100,robe,10,法王のローブ,0/0,0/0,0/0,0/0,0/0', { wisdom:3, mpregeneration:2 },
        { PraySkill:1, PurifySkill:1 }],
    ['1029200,robe,10,巫女の緋袴,0/0,0/0,0/0,0/10,0/0', { will:2, resistancesleep:1 },
        { HolyattackSkill:1 }],

    // 軽鎧
    ['1031100,lightarmor,1,破壊神シヴァの皮鎧,30/0,30/0,0/0,0/0,0/0', { strength:3, magic:3,
        lightweight:5 }, { ComboattackSkill:1, MagicswordSkill:1 }],
    ['1031200,lightarmor,1,危ないビキニ・アーマー,0/0,0/0,0/0,25/0,0/0', { lightweight:1 },
        { ProcsleepSkill:1, ProcparalysisSkill:1, ProcblindnessSkill:1, ProcsripSkill:1 }],
    ['1039100,lightarmor,10,フルメタル・ジャケット,0/0,0/0,0/0,0/0,0/0', { vitality:3, will:3 },
        { GutsSkill:1 }],
    ['1039200,lightarmor,10,弓師の胸当て,15/0,0/0,0/0,0/0,0/0', { skillfulness:3 }, {}],

    // 鎖帷子
    ['1041100,chain,1,黒檀の鎖帷子,0/0,0/0,0/0,0/0,0/0', { quickness:5, lightweight:2 },
        { StealthSkill:3 }],
    ['1049100,chain,10,エルフの鎖帷子,0/0,0/25,0/0,0/10,0/5', { skillfulness:2, lightweight:1 }, {}],

    // 鎧
    ['1051100,armor,1,名も無き勇者の鎧,0/0,0/0,0/10,0/10,0/0', { strength:3, vitality:3, skillfulness:3,
        quickness:3, magic:3, will:3, wisdom:3 }, {}],
    ['1051200,armor,1,ドラゴンメイル,0/40,0/40,0/0,0/0,0/0', { vitality:5, hpregeneration:3,
        magicinclusion:1 }, { MagicalbreathSkill:1 }],
    ['1059100,armor,10,刃の鎧,10/0,0/0,0/0,0/0,10/0', {}, { CounterattackSkill:1 }],
    ['1059200,armor,10,まほうのよろい,0/0,0/25,0/0,0/0,0/5', { mpregeneration:3, magicinclusion:2 }, {}],

    // 甲冑
    ['1061100,platearmor,1,パワードスーツ,0/25,0/0,0/0,0/0,0/0', { strength:5, vitality:5,
        skillfulness:5, quickness:5 }, {}],
    ['1061200,platearmor,1,タイタンスーツ,0/100,0/0,0/0,0/0,12/0', { hpregeneration:2, heavyweight:3 },
        {}],
    ['1069100,platearmor,10,マクシミリアン,0/0,0/0,0/0,0/0,0/0', { vitality:3, will:2 },
        { ParrySkill:1 }],

    // 小盾
    ['2011100,smallshield,1,八咫鏡,0/0,0/0,0/0,0/0,0/0', { magic:3, will:3, wisdom:3,
        mpregeneration:5, magicinclusion:2 }, { DefenseenhancementSkill:1 }],
    ['2011200,smallshield,1,魔王の盾,0/-100,50/-100,0/0,0/20,20/20', { magic:5, magicinclusion:2,
        lightweight:2 }, { AttackenhancementSkill:1 }],
    ['2019100,smallshield,10,ＡＴ・シールド,0/50,0/0,0/0,0/0,5/0', { will:3, lightweight:5 },
        { BerserkSkill:1 }],
    ['2019200,smallshield,10,アバンシング・ガード,0/0,0/0,0/0,0/0,10/0', { vitality:3, lightweight:1 },
        { ParrySkill:1, CounterattackSkill:1 }],
    ['2019300,smallshield,10,リフレクトシールド,0/0,0/0,0/0,0/0,0/10', { vitality:3, lightweight:1 },
        { ParrySkill:1, CounterattackSkill:1 }],

    // 盾
    ['2021100,shield,1,名も無き勇者の盾,0/0,0/0,0/0,0/0,5/5', { strength:3, vitality:3, skillfulness:3,
        quickness:3, magic:3, will:3, wisdom:3 }, {}],
    ['2021200,shield,1,ドラゴンシールド,0/0,0/75,0/0,0/0,0/0', { vitality:5, hpregeneration:3,
        magicinclusion:1 }, { MagicalbreathSkill:1 }],
    ['2025100,shield,10,力の盾,0/0,0/0,0/0,0/0,5/0', { vitality:3, hpregeneration:2 },
        { DivineGraceSkill:1, DivineGrace2Skill:1, GutsSkill:1 }],
    ['2025200,shield,10,水鏡の盾,0/0,0/0,0/0,0/50,0/5', { wisdom:2, mpregeneration:2,
        magicinclusion:2, lightweight:1 }, { PurifySkill:1 }],

    // 大盾
    ['2031100,largeshield,1,イージスの盾,0/25,0/25,0/0,0/25,12/12', { vitality:5, will:3 },
        { ProtectSkill:1 }],
    ['2039100,largeshield,10,絶対安全シールド,-999/0,-999/0,-999/0,-999/33,33/33', { heavyweight:3 },
        { InvincibleSkill:1 }],
    ['2039200,largeshield,10,ハンムラビの大盾,25/0,0/0,0/0,0/0,10/0', { strength:3 },
        { CounterattackSkill:1 }],

    // 指輪
    ['3011100,ring,0.1,金無垢の指輪,0/0,0/0,0/0,50/-25,0/0', { magic:15, magicinclusion:10 },
        { StealthSkill:3, AvoidtrapSkill:1, PermanentcurseSkill:2 }],
    ['3011200,ring,1,ソロモン王の指輪,0/0,0/0,0/0,25/0,0/0', { magic:3, will:5, magicinclusion:2 }, {}],
    ['3011300,ring,1,ダークリング,0/0,0/0,0/0,0/0,0/0', { will:-3, wisdom:-3, hpregeneration:50 }, {}],
    ['3019100,ring,10,祈りの指輪,0/0,0/0,0/0,0/0,0/0', { mpregeneration:10 }, {}],
    ['3019200,ring,10,エンゲージリング,0/0,0/0,0/0,0/0,0/0', { will:3 }, { LuckSkill:1 }],
    ['3019300,ring,10,緑光のパワーリング,0/0,25/0,0/0,0/0,0/0', { magicinclusion:1 },
        { MagicalattackallSkill:1, DefenseenhancementSkill:1 }],

    // 腕輪
    ['3029100,bracelet,10,魔術師の青腕輪,0/0,10/0,0/0,0/0,0/0', { magic:3, mpregeneration:2,
        speedboost:2 }, {}],
    ['3029200,bracelet,10,透視の腕輪,0/0,0/0,0/0,0/0,0/0', { wisdom:2 },
        { DetecttrapSkill:1, MagicalkeySkill:1 }],

    // 首飾り
    ['3031100,necklace,1,八尺瓊勾玉,0/0,0/0,0/0,0/0,0/5', { will:3, wisdom:5, mpregeneration:3 },
        { DetecttrapSkill:3 }],
    ['3031200,necklace,1,紫光の首飾り,0/0,0/0,0/0,0/75,0/0', {}, {}],
    ['3039100,necklace,10,螺旋ドリルの首飾り,15/0,0/0,0/0,0/0,0/0', { will:3 }, { GutsSkill:1 }],
    ['3039200,necklace,10,マリー・アントワネットの首飾り,0/0,0/0,0/0,0/0,0/0', { highprice:5 },
        { EliteSkill:3, BadluckSkill:1 }],

    // 護符
    ['3041100,amulet,0.1,イェンダーの魔除け,0/0,0/25,0/25,0/25,10/10', { hpregeneration:3 },
        { EmergencyescapeSkill:1, SecureretreatSkill:1, AvoidtrapSkill:1, LuckSkill:1 }],
    ['3041200,amulet,1,永久水晶,0/0,25/25,0/0,0/0,0/0', { vitality:3, magic:3 },
        { DefensemasterySkill:1, ProtectSkill:1 }],
    ['3049100,amulet,10,大吉おみくじ,0/0,0/0,0/0,0/10,0/0', {}, { LuckSkill:1 }],

    // 呪符
    ['3059100,talisman,10,道士の御札,0/0,0/0,0/0,0/0,0/0', { skillfulness:2, quickness:2 },
        { HolyattackSkill:1 }],

    // 紋章
    ['3061100,emblem,1,力のメダル,0/0,0/0,0/0,0/0,0/0', {}, { MotivationupSkill:3 }],
    ['3069100,emblem,10,黄金のスカラベ,0/0,0/0,0/0,0/0,0/0', { hpregeneration:3, highprice:3 },
        { LuckSkill:1, ResuscitationSkill:1 }],

    // 宝玉
    ['3071100,stone,1,賢者の石,0/0,0/0,0/0,0/0,0/0', { vitality:4, wisdom:4,
        hpregeneration:4, mpregeneration:4, magicinclusion:1 },
        { DivineGraceSkill:1, DivineGrace2Skill:1, PraySkill:1, Pray2Skill:1, PurifySkill:1 }],
    ['3079100,stone,10,浮遊石,0/0,25/0,0/0,0/0,0/0', { speedboost:10, lightweight:5 },
        { Magicalattack3Skill:1 }],

    // 玉, 8
    // 鏡, 9
    // 杯, 10

    // 小手
    ['3111100,gauntlets,1,銀の手,0/0,0/0,0/0,0/0,0/0', { strength:5, skillfulness:5 }, {}],
    ['3111200,gauntlets,1,妖魔の小手,0/0,0/0,10/0,0/0,0/0', { magic:3 }, {}],
    ['3119100,gauntlets,10,ベア・クロー,35/0,0/0,0/0,0/0,0/0', { lightweight:5 }, {}],
    ['3119200,gauntlets,10,巨人の小手,10/10,0/0,0/0,0/0,0/0', { strength:5, heavyweight:2 }, {}],

    // 靴, 12
    // 足当て, 13
    // 帽子, 14
    ['3141100,helmet,1,名も無き勇者の兜,0/10,0/10,0/0,0/0,0/0', { strength:3, vitality:3, skillfulness:3,
        quickness:3, magic:3, will:3, wisdom:3 }, {}],
    ['3141200,helmet,1,ハデスの兜,0/0,0/0,0/0,0/0,0/0', { avoidanceboost:10, lightweight:2 },
        { StealthSkill:3 }],
    ['3141300,helmet,1,ドラゴンヘルム,0/0,0/50,0/0,0/0,0/0', { vitality:5, hpregeneration:3,
        magicinclusion:1 }, { MagicalbreathSkill:1, Magicalbreath2Skill:1, Magicalbreath3Skill:1 }],
    ['3149100,helmet,10,ユニコーンヘルム,0/0,0/0,0/0,0/20,0/0', { wisdom:3 }, { PurifySkill:1 }],
    ['3149200,helmet,10,防毒マスク,0/0,0/0,0/0,0/0,0/0', { resistancesleep:1,
        resistanceparalysis:1, resistanceblindness:1 }, {}],
    ['3149300,helmet,10,般若の面,0/125,0/0,0/0,0/-50,0/0', {}, { BerserkSkill:1, PermanentcurseSkill:1 }],

];

    // 利用可能データとして展開
    $f.each(rawDataList, function(i, r){
        var d = {};

        // 固定プロパ
        var fixed = r[0].replace(/\//g, ',').split(',');
        d.artifactId = fixed[0];
        d.equipmentType = fixed[1];
        d.ratio = parseFloat(fixed[2]);
        d.artifactName = fixed[3];
        d.attack = parseInt(fixed[4]);
        d.defense = parseInt(fixed[5]);
        d.magicAttack = parseInt(fixed[6]);
        d.magicDefense = parseInt(fixed[7]);
        d.hit = parseInt(fixed[8]);
        d.avoidance = parseInt(fixed[9]);
        d.special = parseInt(fixed[10]);
        d.resistance = parseInt(fixed[11]);
        d.parry = parseInt(fixed[12]);
        d.magicParry = parseInt(fixed[13]);

        // 可変プロパ
        d.enchants = r[1];
        d.skills = r[2];

        arties[d.artifactId] = d;
    });

    return arties;
})();

/** 指定装備種類のアーティファクトを比率を考慮してランダム選択する
    @return str=アーティファクトID | null=指定種類のアーティファクト無し */
$a.Equipment._randArtifactId = function(equipmentType){
    var ratios = {};
    $.each(this.artifacts, function(k, v){
        if (v.equipmentType !== equipmentType) return;
        ratios[v.artifactId] = v.ratio;
    });
    if ($f.keys(ratios).length === 0) return null;
    return $f.randRatioChoice(ratios);
};
