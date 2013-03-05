var INVENTORY_PAGE_ITEMS = 16;
var INVENTORY_PAGE_WIDTH = 416;
var g_bIsTrading = false;
var g_bIsInventoryPage = false;
var g_bWalletTradeUnavailable = false;
var ITEM_HOVER_DELAY = 500;

/*
 *		Initialization
 */

function InitInventoryPage( bHasPendingGifts, showAppId )
{
	INVENTORY_PAGE_ITEMS = 25;	//5 x 5 grid
	INVENTORY_PAGE_WIDTH = 104 * 5;
	g_bIsInventoryPage = true;

	// set up the filter control
	Filter.InitFilter( $('filter_control') );

	// decide what page we're going to start with
	// 	priority: hash params > cookie > first non-empty inventory > first inventory
	var oHashParams = ReadInventoryHash( window.location.hash );
	var oCookieParams = ReadInventoryCookie( GetCookie( 'strInventoryLastContext' ) );

	if ( window.location.hash == '#pending_gifts' && $('tabcontent_pendinggifts') )
	{
		if ( bHasPendingGifts )
			ShowPendingGifts();
		else
			ShowItemInventory( 753, 1 );
	}
	else if ( oHashParams && BValidateHashParams( oHashParams ) )
	{
		ShowItemInventory( oHashParams.appid, oHashParams.contextid, oHashParams.assetid );
	}
	else if ( showAppId != -1 )
	{
		if ( showAppId == 0 )
			showAppId = 753;

		ShowItemInventory( showAppId, 0 );
	}
	else if ( oCookieParams )
	{
		ShowItemInventory( oCookieParams.appid, oCookieParams.contextid );
		UserYou.SetDefaultInventoryId( oCookieParams );
	}
	else
	{
		var oFirstInventory = null;
		var oFirstNonEmptyInventory = null;
		for ( var appid in g_rgAppContextData )
		{
			var rgApp = g_rgAppContextData[appid];
			for ( var contextid in rgApp.rgContexts )
			{
				var rgContext = rgApp.rgContexts[contextid];
				if ( rgContext.asset_count && !oFirstNonEmptyInventory )
				{
					oFirstNonEmptyInventory = { appid: appid, contextid: contextid };
					break;
				}
				else if ( !oFirstInventory )
				{
					oFirstInventory = { appid: appid, contextid: contextid };
				}
			}
			if ( oFirstNonEmptyInventory )
				break;
		}
		var oInventoryToShow = oFirstNonEmptyInventory ? oFirstNonEmptyInventory : oFirstInventory;
		if ( oInventoryToShow )
		{
			ShowItemInventory( oInventoryToShow.appid, oInventoryToShow.contextid )
			UserYou.SetDefaultInventoryId( oInventoryToShow );
		}

	}

	// watch for incoming # urls
	new LocationHashObserver( null, 0.2, OnLocationChange );
}

function ReadInventoryHash( hash )
{
	if ( hash && hash.length > 1 )
	{
		var rgHashElements = hash.substring(1).split('_');
		if ( rgHashElements.length >= 1 && rgHashElements.length < 4 )
		{
			var oLocation = { appid: parseInt( rgHashElements[0] ) };
			if ( rgHashElements.length >= 2 )
				oLocation.contextid = rgHashElements[1];
			if ( rgHashElements.length == 3 )
				oLocation.assetid = rgHashElements[2];
			return oLocation;
		}
	}
	return null;
}

function ReadInventoryCookie( cookie )
{
	if( cookie )
	{
		var rgCookieElements = cookie.split('_');
		if ( rgCookieElements.length == 2 )
		{
			var oCookieParams = {};
			oCookieParams.appid = parseInt( rgCookieElements[0] );
			oCookieParams.contextid = parseInt( rgCookieElements[1] );
			if ( BValidateHashParams( oCookieParams ) )
				return oCookieParams;
			else if ( g_rgAppContextData[ oCookieParams.appid ] )
			{
				// cookie wasn't valid, but we do know the app, see if there's another context we can use
				var rgContexts = g_rgAppContextData[ oCookieParams.appid ].rgContexts;
				for ( contextid in rgContexts )
				{
					if ( rgContexts[contextid].asset_count )
					{
						oCookieParams.contextid = contextid;
						break;
					}
				}
				// one more time
				if ( BValidateHashParams( oCookieParams ) )
					return oCookieParams;
			}
		}
	}
	return null;
}

function BValidateHashParams( oHashParams )
{
	if ( oHashParams && oHashParams.appid && g_rgAppContextData[oHashParams.appid] )
	{
		if ( oHashParams.contextid && !g_rgAppContextData[oHashParams.appid].rgContexts[oHashParams.contextid] )
			delete oHashParams.contextid;
		return true;
	}
	return false;

}

LocationHashObserver = Class.create(Abstract.TimedObserver, {
	getValue: function() {
		return window.location.hash;
	}
} );

function OnLocationChange ( elIgnored, hash )
{
	var oHashParams = ReadInventoryHash( hash );
	if ( hash == '#pending_gifts' && $('tabcontent_pendinggifts') )
	{
		ShowPendingGifts();
	}
	else if ( oHashParams && BValidateHashParams( oHashParams ) )
	{
		ShowItemInventory( oHashParams.appid, oHashParams.contextid, oHashParams.assetid );
	}
	else
	{
		var inventoryDefault = UserYou.GetDefaultInventoryId();
		ShowItemInventory( inventoryDefault.appid, inventoryDefault.contextid );
	}
}

/* 
 *		Inventory
 */
var g_ActiveInventory = null;

function InventoryNextPage()
{
	g_ActiveInventory.NextPage();
}
function InventoryPreviousPage()
{
	g_ActiveInventory.PreviousPage();
}

function ShowTagFilters()
{
	if( g_ActiveInventory && g_ActiveInventory.getTagContainer() )
		g_ActiveInventory.getTagContainer().show();

	$( 'filter_tag_show' ).hide();
	$( 'filter_tag_hide' ).show();

	var elTagHolder = $( 'filter_options' );
	if( elTagHolder )
	{
		elTagHolder.removeClassName( 'filter_collapsed' );
		elTagHolder.addClassName( 'filter_expanded' );
	}
}

function HideTagFilters()
{
	$$( '.econ_tag_filter_checkbox' ).each( function( elCheckbox ) {
		if( $( elCheckbox ).checked )
			$( elCheckbox ).checked = false;
	});

	if( g_ActiveInventory && g_ActiveInventory.getTagContainer() )
	{
		g_ActiveInventory.getTagContainer().hide();
		$( 'filter_tag_show' ).show();
		$( 'filter_tag_hide' ).hide();
		Filter.UpdateTagFiltering( {} );

		if( Object.values( g_ActiveInventory.tags ).length == 0 )
		{
			$( 'filter_tag_show' ).hide();
		}
		else
		{
			$( 'filter_tag_show' ).show();
		}
	}

	var elTagHolder = $( 'filter_options' );
	if( elTagHolder )
	{
		elTagHolder.addClassName( 'filter_collapsed' );
		elTagHolder.removeClassName( 'filter_expanded' );
	}
}

var kStandardTag_Tradable =
{
	name: 'Tradable',
	internal_name: "tradable",
	category: "misc",
	category_name: 'Misc'
};

var kStandardTag_Untradable =
{
	name: 'Not Tradable',
	internal_name: "untradable",
	category: "misc",
	category_name: 'Misc'
};

var CInventory = Class.create( {
	owner: null,
	appid: 0,
	contextid: 0,
	rgInventory: null,
	rgCurrency: null,

	elInventory: null,
	rgItemElements: null,
	elTagContainer: null,

	initialized: false,
	
	cItemsPerPage: 0,
	cPageWidth: 0,

	pageCurrent: 0,
	pageList: null,
	pageTotal: 0,
	
	selectedItem: null,

	bInPagingTransition: false,

	bNeedsRepagination: true,
	
	initialize: function( owner, appid, contextid, rgInventory, rgCurrency )
	{
		this.owner = owner;
		this.appid = appid;
		this.contextid = contextid;
		this.rgInventory = rgInventory;
		this.rgCurrency = rgCurrency;
		var strCompositeId = appid + '_' + contextid;
		this.elInventory = new Element( 'div', {id: 'inventory_' + strCompositeId, 'class': 'inventory_ctn' } );
		this.rgItemElements = new Array();
		this.elTagContainer = new Element( 'div', {id: 'tags_' + strCompositeId } );

		// make sure inventory is stored as an object, not an array
		if ( this.rgInventory instanceof Array )
		{
			if ( this.rgInventory.length == 0 )
				this.rgInventory = null;
			else
				this.rgInventory = Object.extend( {}, this.rgInventory );
		}
		// make sure inventory is stored as an object, not an array
		if ( this.rgCurrency instanceof Array )
		{
			if ( this.rgCurrency.length == 0 )
				this.rgCurrency = null;
			else
				this.rgCurrency = Object.extend( {}, this.rgCurrency );
		}

		this.tags = {};
		if ( this.rgInventory )
		{
			for ( var itemid in this.rgInventory )
			{
				var rgItem = this.rgInventory[itemid];
				rgItem.appid = this.appid;
				rgItem.contextid = this.contextid;

				if ( rgItem.amount && rgItem.amount > 1 )
				{
					rgItem.original_amount = rgItem.amount;
					rgItem.is_stackable = true;
				}

				if( !rgItem.tags )
					rgItem.tags = [];

				if ( !g_bIsTrading )
				{
					if( rgItem.tradable )
						rgItem.tags.push( kStandardTag_Tradable );
					else
						rgItem.tags.push( kStandardTag_Untradable );
				}

				for( var tagid in rgItem.tags )
				{
					var rgTag = rgItem.tags[ tagid ];
					var rgCategory = this.tags[ rgTag.category ];

					if( !rgCategory )
					{
						if( typeof rgTag.category != "string" )
							continue;

						rgCategory = this.tags[ rgTag.category ] = { "name": rgTag.category_name ? rgTag.category_name : rgTag.category, "tags": {} };
					}

					if( rgCategory.tags[ rgTag.internal_name ] )
						rgCategory.tags[ rgTag.internal_name ].count++;
					else
					{
						var rgNewTag = { "name": rgTag.name, "count": 1 };
						if( rgTag.color )
							rgNewTag.color = rgTag.color;
						rgCategory.tags[ rgTag.internal_name ] = rgNewTag;
					}
				}
			}
		}

		if ( this.rgCurrency )
		{
			for ( var currencyid in this.rgCurrency )
			{
				var rgCurrency = this.rgCurrency[currencyid];
				rgCurrency.appid = this.appid;
				rgCurrency.contextid = this.contextid;
				rgCurrency.original_amount = rgCurrency.amount;
				rgCurrency.is_currency = true;
				rgCurrency.is_stackable = true;

				if( !rgCurrency.tags )
					rgCurrency.tags = [];

				if ( !g_bIsTrading )
				{
					if( rgCurrency.tradable )
						rgCurrency.tags.push( kStandardTag_Tradable );
					else
						rgCurrency.tags.push( kStandardTag_Untradable );
				}

				for( var tagid in rgCurrency.tags )
				{
					var rgTag = rgCurrency.tags[ tagid ];
					var rgCategory = this.tags[ rgTag.category ];

					if( !rgCategory )
					{
						if( typeof rgTag.category != "string" )
							continue;

						rgCategory = this.tags[ rgTag.category ] = { "name": rgTag.category_name ? rgTag.category_name : rgTag.category, "tags": {} };
					}

					if( rgCategory.tags[ rgTag.internal_name ] )
						rgCategory.tags[ rgTag.internal_name ].count++;
					else
					{
						var rgNewTag = { "name": rgTag.name, "count": 1 };
						if( rgTag.color )
							rgNewTag.color = rgTag.color;
						rgCategory.tags[ rgTag.internal_name ] = rgNewTag;
					}
				}
			}

		}
	},

	getInventoryElement: function()
	{
		return this.elInventory;
	},

	getTagContainer: function()
	{
		return this.elTagContainer;
	},

	hide: function()
	{
		this.elInventory.hide();
		if( this.elTagContainer )
			this.elTagContainer.hide();
	},

	show: function()
	{
		this.elInventory.show();
	},

	BIsEmptyInventory: function()
	{
		return !this.rgInventory && !this.rgCurrency;
	},

	BIsPendingInventory: function()
	{
		// pending means we are still waiting for the inventory to load
		return false;
	},

	Initialize: function()
	{
		if ( !this.BIsEmptyInventory() )
		{
			this.BuildInventoryDisplayElements();
		}

		this.BuildInventoryTagFilters();

		this.pageCurrent = 0;
		this.bNeedsRepagination = true;

		this.initialized = true;
	},

	TagCheckboxChanged: function( )
	{
		// build an array of the selected tags
		var rgCategories = {};

		this.elTagContainer.select('.econ_tag_filter_category').each(function( elCategory ){
			var rgTags = [];

			$( elCategory ).select( '.econ_tag_filter_checkbox' ).each( function( elCheckbox ) {
				if( $(elCheckbox).checked )
				{
					var elParent = $(elCheckbox).up();
					elParent.addClassName( "filtered" );
					rgTags.push($(elCheckbox).readAttribute( 'tag_name' ) );
				}
				else
				{
					$(elCheckbox).up().removeClassName( "filtered" );
				}
			});

			if( rgTags.length )
				rgCategories[ elCategory.category_name ] = rgTags;
		});

		Filter.UpdateTagFiltering( rgCategories );
	},

	BuildInventoryTagFilters: function()
	{
		if( !this.elTagContainer )
			return;

		for( var sCategoryName in this.tags )
		{
			if( typeof sCategoryName != "string" )
				continue;
			var rgCategory = this.tags[ sCategoryName ];
			var elTagCategory = new Element( 'div', { 'class' : 'econ_tag_filter_category' } );
			elTagCategory.category_name = sCategoryName;

			var elTagCategoryLabel = new Element( 'div', { 'class' : 'econ_tag_filter_category_label' } );
			elTagCategoryLabel.update( rgCategory.name );
			elTagCategory.appendChild( elTagCategoryLabel );

			for( var sInternalName in rgCategory.tags )
			{
				if( typeof sInternalName != "string" )
					continue;
				var rgTag = rgCategory.tags[ sInternalName ];

				var elTagDiv = new Element( 'div', { 'class' : 'econ_tag_filter_container' } );

				var sCheckboxName =  'tag_filter_' + this.appid + '_' + sCategoryName + '_' + sInternalName;
				var elTagFilter = new Element( 'input', { 'class' : 'econ_tag_filter_checkbox', 'type' : 'checkbox', 'name' : sCheckboxName, 'id' : sCheckboxName, 'tag_name' : sInternalName } );
				var elTagLabel = new Element( 'label', { 'class' : 'econ_tag_filter_label', 'for' : sCheckboxName } );

				if( rgTag.color )
				{
					var elTagName = new Element( 'span' );
					elTagName.update( rgTag.name )
					elTagName.style.color = "#" + rgTag.color;
					elTagLabel.appendChild( elTagName );
				}
				else
				{
					elTagLabel.update( rgTag.name );
				}

				var elItemCount = new Element( 'span', { 'class' : 'econ_tag_count' } );
				elItemCount.update( " (" + rgTag.count + ")" );
				elTagLabel.appendChild( elItemCount );

				$( elTagFilter ).observe( 'click', this.TagCheckboxChanged.bind( this ) );

				elTagDiv.appendChild( elTagFilter );
				elTagDiv.appendChild( elTagLabel );
				elTagCategory.appendChild( elTagDiv );
			}

			this.elTagContainer.appendChild( elTagCategory );
		}

		// add a div to clear the floating
		this.elTagContainer.appendChild( new Element( 'div', { "style" : "clear: left;" } ) );
	},

	BuildInventoryDisplayElements: function()
	{
		var strCompositeId = this.appid + '_' + this.contextid;

		for ( var currencyid in this.rgCurrency )
		{
			var rgCurrency = this.rgCurrency[currencyid];

			// hide wallet currencies this user does not care about
			if ( CurrencyIsWalletFunds( rgCurrency ) &&
					( g_bWalletTradeUnavailable ||
					( typeof(g_rgWalletInfo) != 'undefined' && g_rgWalletInfo['wallet_currency'] != ( rgCurrency.id % 1000 ) ) ) )
			{
					continue;
			}

			var elCurrency = this.BuildItemElement( rgCurrency );

			if ( g_bIsTrading )
				MakeCurrencyDraggable( elCurrency );

			var elItemHolder = new Element( 'div', {'class': 'itemHolder' } );
			elItemHolder.appendChild( elCurrency );

			this.rgItemElements.push( elItemHolder );

			rgCurrency.element = elCurrency;
			rgCurrency.homeElement = elItemHolder;
		}

		var rgSortedInventory = { };
		for ( var itemid in this.rgInventory )
		{
			var rgItem = this.rgInventory[itemid];
			rgSortedInventory[rgItem.pos] = rgItem;
		}

		for ( var pos in rgSortedInventory )
		{
			var rgItem = rgSortedInventory[pos];
			var itemid = rgItem.id;
			var elItem;

			try {
				elItem = this.BuildItemElement( rgItem );
			}
			catch ( e )
			{
				elItem = this.BuildUnknownItemElement( itemid );
			}

			if ( g_bIsTrading )
			{
				if ( rgItem.is_stackable )
					MakeCurrencyDraggable( elItem );
				else
					MakeItemDraggable( elItem );
			}

			var elItemHolder = new Element( 'div', {'class': 'itemHolder' } );
			elItemHolder.appendChild( elItem );

			this.rgItemElements.push( elItemHolder );

			rgItem.element = elItem;
			rgItem.homeElement = elItemHolder;
		}
	},

	LayoutPages: function()
	{
		// remove any current page elements
		this.elInventory.childElements().invoke('remove');

		var elPage = new Element( 'div', {'class': 'inventory_page' } );
		var oPageBuilder = { elPage: elPage, cPageItemsRemaining: INVENTORY_PAGE_ITEMS };

		for ( var iItem = 0; iItem < this.rgItemElements.length; iItem++ )
		{
			var elItemHolder = this.rgItemElements[iItem];

			if ( elItemHolder.parentNode )
				elItemHolder.remove();
			this.AddElementToPage( elItemHolder, oPageBuilder );
		}

		for ( var i = 0; i < oPageBuilder.cPageItemsRemaining; i++ )
		{
			oPageBuilder.elPage.appendChild( new Element( 'div', {'class': 'itemHolder disabled' } ) );
		}
		oPageBuilder.elPage.hide();
		this.elInventory.appendChild( oPageBuilder.elPage );

		var rgPages = this.elInventory.childElements();
		this.pageList = rgPages;
		this.pageTotal = rgPages.length;
		for ( var i = 0; i < rgPages.length; i++ )
			rgPages[i].iPage = i;

		this.bNeedsRepagination = false;
	},

	AddElementToPage: function( elItemHolder, oPageBuilder )
	{
		if ( oPageBuilder.cPageItemsRemaining-- <= 0 )
		{
			oPageBuilder.elPage.hide();
			this.elInventory.appendChild( oPageBuilder.elPage );
			oPageBuilder.elPage = new Element( 'div', {'class': 'inventory_page' } );
			oPageBuilder.cPageItemsRemaining = INVENTORY_PAGE_ITEMS - 1;
		}

		oPageBuilder.elPage.appendChild( elItemHolder );

	},


	BuildItemElement: function( rgItem )
	{
		var elItem = new Element( 'div', { id: 'item' + this.appid + '_' + this.contextid + '_' + rgItem.id, 'class': 'item app' + this.appid + ' context' + this.contextid } );
		if ( rgItem.name_color )
			elItem.style.borderColor = '#' + rgItem.name_color;
		if ( rgItem.background_color )
			elItem.style.backgroundColor = '#' + rgItem.background_color;

		rgItem.appid = this.appid;
		rgItem.contextid = this.contextid;
		elItem.rgItem = rgItem;

		if ( rgItem.is_stackable )
			elItem.lazyload_image = ImageURL( rgItem.icon_url, '96f', '58f' );
		else
			elItem.lazyload_image = ImageURL( rgItem.icon_url, '96f', '96f' );

		if ( typeof( rgItem.icon_drag_url ) != 'undefined' && rgItem.icon_drag_url != '' )
		{
			if ( rgItem.is_stackable )
				elItem.drag_image = ImageURL( rgItem.icon_drag_url, '96f', '58f' );
			else
				elItem.drag_image = ImageURL( rgItem.icon_drag_url, '96f', '96f' );
		}

		if ( rgItem.is_stackable )
		{
			var elAmount = new Element( 'div', { 'class': 'item_currency_amount' } );
			if ( rgItem.name_color )
				elAmount.style.color = '#' + rgItem.name_color;

			if ( CurrencyIsWalletFunds( rgItem ) )
				elAmount.update( v_currencyformat( rgItem.amount, rgItem.name ) );
			else
				elAmount.update( v_numberformat( rgItem.amount ) );

			elItem.appendChild( elAmount );

			var elCurrencyName = new Element( 'div', { 'class': 'item_currency_name' } );
			if ( rgItem.name_color )
				elCurrencyName.style.color = '#' + rgItem.name_color;

			elCurrencyName.update( rgItem.is_currency ? rgItem.name : '' );

			elItem.appendChild( elCurrencyName );
		}

		if ( g_bIsTrading )
		{
			Event.observe( elItem, 'mouseover', MouseOverItem.bindAsEventListener( null, this.owner, elItem, rgItem ) );
			Event.observe( elItem, 'mouseout', MouseOutItem.bindAsEventListener( null, this.owner, elItem, rgItem ) );
		}

		var url = ( g_bIsTrading ? this.GetInventoryPageURL() : '' ) + '#' + this.appid + '_' + this.contextid + '_' + rgItem.id;
		var elLink = new Element( 'a', { href: url, 'class': 'inventory_item_link' } );
		if ( Prototype.Browser.IE )
		{
			elLink.appendChild( new Element( 'img', {src: 'http://cdn.steamcommunity.com/public/images/trans.gif', width: 96, height: 96 } ) );
		}
		elItem.appendChild( elLink );
		if ( g_bIsInventoryPage )
			Event.observe( elLink, 'click', this.SelectItem.bindAsEventListener( this, elItem, rgItem ) );
		else
			Event.observe( elLink, 'click', this.SelectItemNoOp ); // no need to bind

		return elItem;
	},

	BuildUnknownItemElement: function( appid, contextid, itemid )
	{
		var elItem = new Element( 'div', {'class': 'item unknownItem' } );
		elItem.identify();
		elItem.update( '<img src="http://cdn.steamcommunity.com/public/images/' + ( g_bIsTrading ? 'login/throbber.gif' : 'trans.gif' ) + '">' );
		elItem.rgItem = { unknown: true, id: itemid, appid: this.appid, contextid: this.contextid, name: 'Unknown Item ' + itemid, descriptions: [], fraudwarnings: [ 'Could not retrieve information about this item.' ] };

		if ( g_bIsTrading )
		{
			Event.observe( elItem, 'mouseover', MouseOverItem.bindAsEventListener( null, this.owner, elItem, elItem.rgItem ) );
			Event.observe( elItem, 'mouseout', MouseOutItem.bindAsEventListener( null, this.owner, elItem, elItem.rgItem ) );
		}

		var url = ( g_bIsTrading ? this.GetInventoryPageURL() : '' ) + '#' + this.appid + '_' + this.contextid + '_' + itemid;
		var elLink = new Element( 'a', { href: url, 'class': 'inventory_item_link' } );
		if ( Prototype.Browser.IE )
		{
			elLink.appendChild( new Element( 'img', {src: 'http://cdn.steamcommunity.com/public/images/trans.gif', width: 96, height: 96 } ) );
		}
		elItem.appendChild( elLink );
		if ( g_bIsInventoryPage )
			Event.observe( elLink, 'click', this.SelectItem.bindAsEventListener( this, elItem, elItem.rgItem ) );
		else
			Event.observe( elLink, 'click', this.SelectItemNoOp ); // no need to bind

		return elItem;
	},

	MakeActive: function()
	{
		// are we taking over paging controls again?
		if ( this.bNeedsRepagination )
			this.LayoutPages();

		var elControls = $('inventory_pagecontrols');
		if ( this.pageTotal <= 1 )
			elControls.style.visibility = 'hidden';
		else
			elControls.style.visibility = '';

		this.SetActivePage( this.pageCurrent );

		this.show();
	},

	LocateAsset: function( itemid )
	{
		if ( this.rgInventory && this.rgInventory[itemid] )
			return this.rgInventory[itemid];
		else
			return null;
	},

	LocateAssetElement: function( itemid )
	{
		if ( !this.initialized )
			this.Initialize();

		if ( this.rgInventory && this.rgInventory[itemid] )
			return this.rgInventory[itemid].element;
		else
			return this.BuildUnknownItemElement( itemid );
	},

	LocateCurrency: function( currencyid )
	{
		if ( this.rgCurrency && this.rgCurrency[currencyid] )
			return this.rgCurrency[currencyid];
		else
			return null;
	},

	LoadPageImages: function( elPage )
	{
		if ( !elPage.images_loaded )
		{
			var rgItemHolders = elPage.childElements();
			for ( var i = 0; i < rgItemHolders.length; i++ )
			{
				var elItemHolder = rgItemHolders[i];
				var elItem = elItemHolder.firstChild;
				this.LoadItemImage( elItem );
			}
			elPage.images_loaded = true;
		}
	},

	LoadItemImage: function( elItem )
	{
		if ( elItem && elItem.lazyload_image )
		{
			elItem.appendChild( new Element( 'img', {src: elItem.lazyload_image } ) );
			elItem.lazyload_image = false;
		}
	},

	NextPage: function()
	{
		if ( this.pageCurrent < this.pageTotal - 1 && !this.bInPagingTransition )
		{
			var iCurPage = this.pageCurrent;
			var iNextPage = iCurPage + 1;
			$('inventories').style.overflow = 'hidden';
			this.elInventory.style.left = '0px';
			this.elInventory.style.width = ( 2 * INVENTORY_PAGE_WIDTH ) + 'px';

			this.pageList[iNextPage].show();
			this.LoadPageImages( this.pageList[iNextPage] );

			this.bInPagingTransition = true;
			var fnOnFinish = this.FinishPageTransition.bind( this, iCurPage, iNextPage );
			this.transitionEffect = new Effect.Move( this.elInventory, {x: -INVENTORY_PAGE_WIDTH, duration: 0.25, afterFinish: fnOnFinish });
		}
	},

	PreviousPage: function()
	{
		if ( this.pageCurrent > 0 && !this.bInPagingTransition )
		{
			var iCurPage = this.pageCurrent;
			var iNextPage = iCurPage - 1;
			$('inventories').style.overflow = 'hidden';
			this.elInventory.style.left = '-' + INVENTORY_PAGE_WIDTH + 'px';
			this.elInventory.style.width = ( 2 * INVENTORY_PAGE_WIDTH ) + 'px';

			this.pageList[iNextPage].show();
			this.LoadPageImages( this.pageList[iNextPage] );

			this.bInPagingTransition = true;
			var fnOnFinish = this.FinishPageTransition.bind( this, iCurPage, iNextPage );
			this.transitionEffect = new Effect.Move( this.elInventory, {x: INVENTORY_PAGE_WIDTH, duration: 0.25, afterFinish: fnOnFinish });
		}
	},

	FinishPageTransition: function( iLastPage, iCurPage )
	{
		this.pageCurrent = iCurPage;
		$('inventories').style.overflow = '';
		this.pageList[iLastPage].hide();
		this.elInventory.style.left = '0px';
		this.elInventory.style.width = '';

		this.bInPagingTransition = false;
		this.UpdatePageCounts();
		this.PreloadPageImages( this.pageCurrent );
	},

	SetActivePage: function( iPage )
	{
		if ( iPage >= this.pageTotal )
			return;
		this.pageList[this.pageCurrent].hide();
		this.pageList[iPage].show();
		this.pageCurrent = iPage;
		this.UpdatePageCounts();

		this.PreloadPageImages( this.pageCurrent );
	},

	PreloadPageImages: function( iPage )
	{
		// this page
		this.LoadPageImages( this.pageList[ iPage ] );
		// next page
		if ( iPage < this.pageTotal - 1 )
			this.LoadPageImages( this.pageList[ iPage + 1 ] );
		// previous page
		if ( iPage > 0 )
			this.LoadPageImages( this.pageList[ iPage - 1 ] );
	},

	UpdatePageCounts: function()
	{
		$('pagecontrol_cur') && $('pagecontrol_cur').update( this.pageCurrent + 1 );
		$('pagecontrol_max') && $('pagecontrol_max').update( this.pageTotal );

		if ( this.pageCurrent > 0 )
			$('pagebtn_previous').removeClassName( 'disabled' );
		else
			$('pagebtn_previous').addClassName( 'disabled' );

		if ( this.pageCurrent < this.pageTotal - 1 )
			$('pagebtn_next').removeClassName( 'disabled' );
		else
			$('pagebtn_next').addClassName( 'disabled' );
	},


	SelectItem: function( event, elItem, rgItem )
	{
		var iNewSelect = ( iActiveSelectView == 0 ) ? 1 : 0;
		var sOldInfo = 'iteminfo' + iActiveSelectView;
		var elOldInfo = $(sOldInfo);
		var sNewInfo = 'iteminfo' + iNewSelect;
		var elNewInfo = $(sNewInfo);

		elOldInfo.style.position = 'absolute';
		elNewInfo.style.position = '';

		if ( elNewInfo.visible )
		{
			elNewInfo.effect && elNewInfo.effect.cancel();
			elNewInfo.hide();
			elNewInfo.style.opacity = 1;
		}
		if ( elNewInfo.blankTimeout )
		{
			window.clearTimeout( elNewInfo.blankTimeout );
		}
		BuildHover( sNewInfo, rgItem, UserYou );
		elOldInfo.style.zIndex = 2;
		elNewInfo.style.zIndex = 1;
		elNewInfo.show();

		elOldInfo.hiding = false;
		HideWithFade( elOldInfo );

		if ( elOldInfo.builtFor && elOldInfo.builtFor.element )
			elOldInfo.builtFor.element.removeClassName('activeInfo');
		$(rgItem.element).addClassName('activeInfo');
		this.selectedItem = rgItem;

		elOldInfo.blankTimeout = window.setTimeout( function() { $(sOldInfo+'_item_icon').src = 'http://cdn.steamcommunity.com/public/images/trans.gif'; }, 200 );

		iActiveSelectView = iNewSelect;

		if ( event )
			event.preventDefault();
	},

	SelectItemNoOp: function( event )
	{

		if ( event )
			event.preventDefault();
	},

	EnsurePageActiveForItem: function( elItem )
	{
		if ( elItem && elItem.parentNode && elItem.parentNode.parentNode )
			this.SetActivePage( elItem.parentNode.parentNode.iPage );
	},

	GetInventoryPageURL: function()
	{
		return UserYou.GetProfileURL() + '/inventory/';
	}

});

var CAppwideInventory = Class.create( CInventory, {

	rgInventories: null,
	bIsAppwideInventory: true,
	rgContextIds: null,
	rgChildInventories: null,
	cInventoriesLoaded: 0,
	bEmpty: true,
	rgAllChildElements: null,

	initialize: function( $super, owner, appid, rgContextIds )
	{
		$super( owner, appid, 0, null, null );
		this.rgContextIds = rgContextIds;
		this.rgChildInventories = {};
		this.rgAllChildElements = new Array();
	},

	Initialize: function()
	{
		this.pageCurrent = 0;
		this.bNeedsRepagination = true;

		this.initialized = true;
	},

	GetContextIds: function()
	{
		return this.rgContextIds;
	},

	AddChildInventory: function( inventory )
	{
		if ( !this.rgChildInventories[ inventory.contextid ] )
			this.cInventoriesLoaded++;

		this.rgChildInventories[ inventory.contextid ] = inventory;
		if ( this.bEmpty && !inventory.BIsEmptyInventory() )
			this.bEmpty = false;

		if( !this.BIsPendingInventory() )
		{
			this.AllChildrenLoaded();
		}
	},

	AllChildrenLoaded: function()
	{
		this.tags = {};

		for( var sContextID in this.rgChildInventories )
		{
			var inventory = this.rgChildInventories[ sContextID ];
			for ( var sCategoryName in inventory.tags )
			{
				var rgChildCategory = inventory.tags[ sCategoryName ];

				var rgCategory = this.tags[ sCategoryName ];

				if( !rgCategory )
				{
					rgCategory = this.tags[ sCategoryName ] = { "name": rgChildCategory.name, "tags": {} };
				}

				for( var tagid in rgChildCategory.tags )
				{
					var rgTag = rgChildCategory.tags[ tagid ];

					if( rgCategory.tags[ tagid ] )
						rgCategory.tags[ tagid ].count += rgTag.count;
					else
					{
						var rgNewTag = { "name": rgTag.name, "count": rgTag.count };
						if( rgTag.color )
							rgNewTag.color = rgTag.color;
						rgCategory.tags[ tagid ] = rgNewTag;
					}
				}
			}
		}

		this.BuildInventoryTagFilters();
		var elTags = this.getTagContainer();
		var elTagHolder = $( 'filter_options' );
		if( elTagHolder && elTags )
		{
			elTags.hide();
			elTagHolder.insert( elTags );
			elTagHolder.addClassName( 'filter_collapsed' );
		}
	},

	OnInventoryReload: function( contextid )
	{
		if ( this.rgChildInventories[ contextid ] )
		{
			this.cInventoriesLoaded--;
			this.rgChildInventories[ contextid ] = null;
			this.bNeedsRepagination = true;
		}
	},

	BIsPendingInventory: function()
	{
		// pending means we are still waiting for the inventory to load
		return this.cInventoriesLoaded < this.rgContextIds.length;
	},

	BIsEmptyInventory: function()
	{
		return this.bEmpty || this.BIsPendingInventory();
	},

	PrepareElementList: function()
	{

	},

	MakeActive: function()
	{
		if ( this.BIsPendingInventory() )
			return;

		for ( var contextid in this.rgChildInventories )
		{
			var inventory = this.rgChildInventories[ contextid ];

			if ( !inventory.initialized )
				inventory.Initialize();

			if ( !inventory.bNeedsRepagination )
			{
				// if an inventory took control of its child elements again, we need to take them back
				this.bNeedsRepagination = true;
				inventory.bNeedsRepagination = true;
			}
		}

		if ( this.bNeedsRepagination )
			this.LayoutPages();

		var elControls = $('inventory_pagecontrols');
		if ( this.pageTotal <= 1 )
			elControls.style.visibility = 'hidden';
		else
			elControls.style.visibility = '';

		this.SetActivePage( this.pageCurrent );

		this.show();
	},

	LayoutPages: function()
	{
		// remove any current page elements
		this.elInventory.childElements().invoke('remove');

		var elPage = new Element( 'div', {'class': 'inventory_page' } );
		var oPageBuilder = { elPage: elPage, cPageItemsRemaining: INVENTORY_PAGE_ITEMS };

		for ( var iContext = 0; iContext < this.rgContextIds.length; iContext++ )
		{
			var contextid = this.rgContextIds[ iContext ]
			var inventory = this.rgChildInventories[ contextid ];
			for ( var iItem = 0; iItem < inventory.rgItemElements.length; iItem++ )
			{
				var elItemHolder = inventory.rgItemElements[iItem];

				if ( elItemHolder.parentNode )
					elItemHolder.remove();
				this.AddElementToPage( elItemHolder, oPageBuilder );
			}
		}

		for ( var i = 0; i < oPageBuilder.cPageItemsRemaining; i++ )
		{
			oPageBuilder.elPage.appendChild( new Element( 'div', {'class': 'itemHolder disabled' } ) );
		}
		oPageBuilder.elPage.hide();
		this.elInventory.appendChild( oPageBuilder.elPage );

		var rgPages = this.elInventory.childElements();
		this.pageList = rgPages;
		this.pageTotal = rgPages.length;
		for ( var i = 0; i < rgPages.length; i++ )
			rgPages[i].iPage = i;

		this.bNeedsRepagination = false;
	},

	LocateAsset: function( itemid )
	{
		for ( var contextid in this.rgChildInventories )
		{
			var item = this.rgChildInventories[ contextid ].LocateAsset( itemid );
			if ( item )
				return item;
		}
		return null;
	}

});

// foreign inventory extends inventory, represents items held by trade partner
var CForeignInventory = Class.create( CInventory, {

	LocateAssetElement: function( itemid )
	{
		var item = this.LocateAsset( itemid );
		if ( item )
		{
			if ( !item.element )
			{
				// we create item elements on demand for the other user
				var element = this.BuildItemElement( item );
				item.element = element;
			}
			return item.element;
		}
		else
			return this.BuildUnknownItemElement( itemid );
	},

	BuildItemElement: function( $super, item )
	{
		// always load images for trading partner items
		var element = $super( item );
		this.LoadItemImage( element );
		return element;
	},

	GetInventoryPageURL: function()
	{
		return UserThem.GetProfileURL() + '/inventory/';
	}

});

var CForeignInventoryPending = Class.create( CInventory, {

	LocateAssetElement: function( itemid )
	{
		return this.BuildUnknownItemElement( itemid );
	},

	LocateAsset: function( itemid )
	{
		return null;
	},

	BIsPendingInventory: function()
	{
		// pending means we are still waiting for the inventory to load
		return true;
	}
});

APPWIDE_CONTEXT = 0;

var CUser = Class.create( {
	bReady: false,
	nItemsInTrade: 0,
	cLoadsInFlight: 0,
	bDynamicLoadInventory: true,
	strProfileURL: null,
	rgContexts: null,
	rgAppwideInventories: null,
	rgContextIdsByApp: null,
	rgAppInfo: null,

	initialize: function() {
		this.rgContexts = {};
		this.rgContextIdsByApp = {};
		this.rgAppwideInventories = {};
		this.rgAppInfo = {};
		this.bReady = false;
	},

	GetContext: function( appid, contextid ) {
		return this.rgContexts[appid] && this.rgContexts[appid][contextid];
	},

	getInventory: function( appid, contextid )
	{
		var rgContext = this.GetContext( appid, contextid );
		var inventory = rgContext ? rgContext.inventory : null;

		if ( !inventory )
		{
			this.loadInventory( appid, contextid );
			// this will be a temporary inventory object
			inventory = rgContext.inventory;
		}
		else if ( inventory.bIsAppwideInventory )
		{
			this.LoadAppwideInventory( inventory );
		}
		return inventory;
	},

	LoadAppwideInventory: function( appwideInventory )
	{
		var appid = appwideInventory.appid;
		var rgContextIds = appwideInventory.GetContextIds();
		for ( var i = 0; i < rgContextIds.length; i++ )
		{
			var contextid = rgContextIds[i];
			var rgContext = this.GetContext( appid, contextid );
			var inventory = rgContext ? rgContext.inventory : null;
			if ( !inventory )
				this.loadInventory( appid, contextid );
		}
	},

	addInventory: function( inventory ) {
		var rgContext = this.GetContext( inventory.appid, inventory.contextid );
		rgContext.inventory = inventory;
	},

	findAsset: function( appid, contextid, itemid ) {
		var inventory = this.getInventory( appid, contextid );
		if ( inventory )
			return inventory.LocateAsset( itemid );
		else
			return null;
	},

	findAssetElement: function( appid, contextid, itemid ) {
		var inventory = this.getInventory( appid, contextid );
		if ( inventory )
		{
			var element = inventory.LocateAssetElement( itemid );
			if ( element )
				inventory.LoadItemImage( element );

			return element;
		}
		else
			return null;
	},

	FindCurrency: function( appid, contextid, currencyid ) {
		var inventory = this.getInventory( appid, contextid );
		if ( inventory )
			return inventory.LocateCurrency( currencyid );
		else
			return null;
	},

	BIsLoadingInventoryData: function()
	{
		return this.cLoadsInFlight > 0;
	},

	SetProfileURL: function( strProfileURL )
	{
		this.strProfileURL = strProfileURL;
	},

	GetProfileURL: function()
	{
		return this.strProfileURL;
	},

	LoadContexts: function( rgAppContextData )
	{
		for ( var appid in rgAppContextData )
		{
			var rgAppData = rgAppContextData[appid];

			var appTradePermissions = 'FULL';
			if ( rgAppData.trade_permissions )
				appTradePermissions = rgAppData.trade_permissions;

			this.rgContexts[appid] = {};
			var rgContextIds = [];

			this.rgAppInfo[appid] = { trade_permissions: appTradePermissions };

			for ( var contextid in rgAppData.rgContexts )
			{
				var rgContext = rgAppData.rgContexts[contextid];
				rgContext.trade_permissions = appTradePermissions;
				rgContext.inventory = null;
				this.rgContexts[appid][contextid] = rgContext;
				rgContextIds.push( contextid );
			}

			if ( rgContextIds.length > 1 )
			{
				// add a virtual context to represent the app-wide view
				var inventory = new CAppwideInventory( this, appid, rgContextIds.clone() );
				var elInventory = inventory.getInventoryElement();
				elInventory.hide();
				$('inventories').insert( elInventory );

				var templAllContextName = new Template( 'All #{appname} Items');

				var rgContext = {
					id: APPWIDE_CONTEXT,
					trade_permissions: appTradePermissions,
					inventory: inventory,
					name: templAllContextName.evaluate( {appname: rgAppData.name } )
				};


				this.rgContexts[appid][APPWIDE_CONTEXT] = rgContext;
				rgContextIds.splice( 0, 0, APPWIDE_CONTEXT );
			}

			this.rgContextIdsByApp[appid] = rgContextIds;
		}
	},

	GetContextIdsForApp: function( appid ) {
		return this.rgContextIdsByApp[appid];
	},

	BIsSingleContextApp: function( appid ) {
		return ( this.rgContextIdsByApp[appid] && this.rgContextIdsByApp[appid].length == 1 ) ? true : false;;
	},

	GetFirstContextForApp: function( appid ) {
		return this.GetContext( appid, this.rgContextIdsByApp[appid][0] );
	}

});

CUserYou = Class.create( CUser, {

	oDefaultInventoryId: null,
	nActiveAppId: null,
	rgActiveContextIdByApp: null,


	initialize: function( $super )
	{
		$super();
		this.rgActiveContextIdByApp = {};
	},

	GetTradePermissions: function( appid, contextid )
	{
		/* trade permissions are app-wide, but could be context-specific in the future */
		var rgContext = this.GetContext( appid, contextid );
		if ( !rgContext )
		{
			if ( !this.rgAppInfo[appid] )
			{
				// We don't know anything about this app, so we're defaulting to full.
				// This allows somebody to receive items in a game they don't yet have items for, for example.
				return 'FULL';
			}
			else
			{
				return this.rgAppInfo[appid].trade_permissions;
			}
		}
		else
		{
			return rgContext.trade_permissions;
		}
	},

	BAllowedToTradeItems: function( appid, contextid )
	{
		var permissions = this.GetTradePermissions( appid, contextid );
		return permissions == 'FULL';
	},

	BAllowedToRecieveItems: function( appid, contextid )
	{
		var permissions = this.GetTradePermissions( appid, contextid );
		return ( permissions == 'FULL' ) || ( permissions == 'RECEIVEONLY' );
	},

	ReloadInventory: function( appid, contextid )
	{
		// force a reload of an inventory that's already been loaded
		var context = this.GetContext( appid, contextid );
		if ( context && context.inventory )
		{
			this.loadInventory( appid, contextid );
			if ( !this.BIsSingleContextApp( appid ) )
			{
				var appwideContext = this.GetContext( appid, APPWIDE_CONTEXT );
				appwideContext.inventory.OnInventoryReload( contextid );
			}
			if ( g_ActiveInventory && g_ActiveInventory.appid == appid && ( g_ActiveInventory.contextid == contextid || g_ActiveInventory.contextid == APPWIDE_CONTEXT ) )
			{
				ShowItemInventory( appid, g_ActiveInventory.contextid );
			}
		}
	},

	loadInventory: function( appid, contextid )
	{
		if ( g_bIsTrading && !this.BAllowedToTradeItems( appid, contextid ) )
		{
			// not allowed to trade, so we just create an empty inventory
			this.addInventory( new CInventory( this, appid, contextid, null, null ) );
			return;
		}
		this.cLoadsInFlight++;
		this.addInventory( new CForeignInventoryPending( this, appid, contextid, null ) );
		var thisClosure = this;

		var params = {};
		if ( g_bIsTrading )
			params.trading = 1;

		new Ajax.Request( g_strInventoryLoadURL + appid + '/' + contextid + '/', {
			method: 'get',
			parameters: params,
			onComplete: function( transport ) { thisClosure.OnLoadInventoryComplete( transport, appid, contextid ); }
		} );
	},

	addInventory: function( $super, inventory ) {
		$super( inventory );

		if ( !inventory.BIsPendingInventory() && !this.BIsSingleContextApp( inventory.appid ) )
		{
			var appwideContext = this.GetContext( inventory.appid, APPWIDE_CONTEXT );
			appwideContext.inventory.AddChildInventory( inventory );

			if ( !appwideContext.inventory.BIsPendingInventory() )
			{
				this.ShowInventoryIfActive( inventory.appid, APPWIDE_CONTEXT );
			}
		}
	},

	OnLoadInventoryComplete: function( transport, appid, contextid )
	{
		this.cLoadsInFlight--;
		if ( transport.responseJSON && transport.responseJSON.success )
		{
			var merged = MergeInventoryWithDescriptions( transport.responseJSON.rgInventory, transport.responseJSON.rgCurrency, transport.responseJSON.rgDescriptions );
			var inventory = new CInventory( this, appid, contextid, merged.inventory, merged.currency );

			this.addInventory( inventory );
			var elInventory = inventory.getInventoryElement();
			elInventory.hide();
			$('inventories').insert( elInventory );

			var elTags = inventory.getTagContainer();
			var elTagHolder = $( 'filter_options' );
			if( elTagHolder && elTags )
			{
				elTags.hide();
				elTagHolder.insert( elTags );
				elTagHolder.addClassName( 'filter_collapsed' );
			}
		}
		else
		{
			var elPendingInventory = $('pending_inventory_page') || $('trade_inventory_pending' );
			var elFailedInventory = $('failed_inventory_page') || $('trade_inventory_failed' );
			if ( transport.responseJSON && transport.responseJSON.busy )
			{
				if ( !elFailedInventory )
				{
					// if we don't have the "Failed" div, then just do a an alert
					alert( 'Your inventory is not available at this time.  Please try again later.' );
				}
			}

			if ( g_ActiveInventory && g_ActiveInventory.appid == appid && ( g_ActiveInventory.contextid == contextid || g_ActiveInventory.contextid == APPWIDE_CONTEXT ) )
			{
				if ( elPendingInventory && elFailedInventory )
				{
					elPendingInventory.hide();
					elFailedInventory.show();
				}
			}

			this.GetContext( appid, contextid ).inventory = null;
			return;
		}

		this.ShowInventoryIfActive( appid, contextid );

		if ( g_bIsTrading )
			RefreshTradeStatus( g_rgCurrentTradeStatus, true );
	},

	ShowInventoryIfActive: function( appid, contextid )
	{
		if ( g_ActiveInventory && g_ActiveInventory.appid == appid && g_ActiveInventory.contextid == contextid )
		{
			if ( g_bIsInventoryPage )
				ShowItemInventory( appid, contextid, null, true );
			else if ( g_bIsTrading )
			{
				TradePageSelectInventory( appid, contextid, true );
			}
		}
	},

	// an obj with .appid and .contextid
	GetDefaultInventoryId: function () {
		return this.oDefaultInventoryId;
	},

	SetDefaultInventoryId: function( oDefaultInventoryId ) {
		this.oDefaultInventoryId = oDefaultInventoryId;
	},

	SetActiveAppId: function( appid ) {
		this.nActiveAppId = appid;
	},

	GetActiveAppId: function() {
		return this.nActiveAppId;
	}

});
UserYou = new CUserYou();

function ShowPendingGifts()
{
	if ( !$('tabcontent_pendinggifts') )
		return;

	$('tabcontent_inventory').hide();
	$('tabcontent_pendinggifts').show();


	var elTab = $('pending_gift_link' );
	$$('.games_list_tabs').first().childElements().invoke( 'removeClassName', 'active')
	elTab.addClassName('active');

	if ( g_ActiveInventory )
		g_ActiveInventory.hide();

	g_ActiveInventory = null;
	UserYou.SetActiveAppId(null);
}

var g_deferredAsset = null;
function ShowItemInventory( appid, contextid, assetid, bLoadCompleted )
{
	$('tabcontent_inventory').show();
	$('tabcontent_pendinggifts') && $('tabcontent_pendinggifts').hide();

	if ( !contextid )
	{
		if ( UserYou.BIsSingleContextApp( appid ) )
			contextid = UserYou.GetFirstContextForApp( appid ).id;
		else
			contextid = APPWIDE_CONTEXT;
	}

	var inventory = UserYou.getInventory( appid, contextid );
	var bAlreadyInitialized = inventory.initialized;

	if ( bLoadCompleted && g_deferredAsset )
	{
		// use the asset we wanted to show before we dynamically loaded inventory
		assetid = g_deferredAsset;
		g_deferredAsset = null;
	}
	var lastAppId = g_ActiveInventory ? g_ActiveInventory.appid : null;
	var lastContextID = g_ActiveInventory ? g_ActiveInventory.contextid : null;
	if ( lastAppId != appid || contextid != lastContextID )
	{
		Filter.ClearFilter();
	}

	// if we're in the appwide context and looking for a specific asset, just scroll
	//	to the asset in the appwide context rather than switching to the specific
	//  context with the item
	if ( assetid && lastAppId == appid && lastContextID == APPWIDE_CONTEXT )
	{
		contextid = APPWIDE_CONTEXT;
	}

	if ( SelectInventory( appid, contextid, bLoadCompleted ) )
	{
		$('iteminfo0').hide();
		$('iteminfo1').hide();

		if ( UserYou.GetActiveAppId() != appid )
		{
			UserYou.SetActiveAppId( appid );

			var elTab = $('inventory_link_' + appid );
			elTab.siblings().invoke( 'removeClassName', 'active');

			var elPendingGift = $('pending_gift_link' );
			if ( elPendingGift )
				elPendingGift.removeClassName('active');
			elTab.addClassName('active');
			var oEconomyDisplay = GetEconomyDisplay( appid, contextid );

			if ( oEconomyDisplay && oEconomyDisplay.inventory_logo )
			{
				if ( !bAlreadyInitialized )
				{
					// explicitly blank logo to prevent it from showing as the old logo until load is complete
					$('inventory_applogo').src = 'http://cdn.steamcommunity.com/public/images/trans.gif';
					var fnUpdate= function() {$('inventory_applogo').src = oEconomyDisplay.inventory_logo };
					fnUpdate.defer();
				}
				else
				{
					$('inventory_applogo').src = oEconomyDisplay.inventory_logo;
				}
				$('inventory_applogo').show();
			}
			else
			{
				$('inventory_applogo').hide();
			}

			if ( UserYou.BIsSingleContextApp( appid ) )
			{
				$('context_selector').hide();
			}
			else
			{
				$('contextselect_options_contexts').update('');
				var rgContextIds = UserYou.GetContextIdsForApp( appid );
				var fnContextClick = function( appid, contextid ) { HideMenu( $('contextselect'), $('contextselect_options') ); window.location = '#' + appid + '_' + contextid; };
				for ( var i = 0; i < rgContextIds.length; i++ )
				{
					var rgContext = UserYou.GetContext( appid, rgContextIds[i] );
					var elContext = new Element( 'div', {'class': 'popup_item context_name', 'id': 'context_option_' + appid + '_' + rgContext.id } );
					elContext.update( rgContext.name );
					var strHash = '#' + appid + '_' + rgContext.id;
					elContext.observe( 'click', fnContextClick.bind( null, appid, rgContext.id ) );


					$('contextselect_options_contexts').appendChild( elContext );
				}
				$('context_selector').show();
			}
		}

		// display the current context in the drop down menu
		if ( !UserYou.BIsSingleContextApp( appid ) )
		{
			// make sure the popup isn't visible
			HideMenu( $('contextselect'), $('contextselect_options') );
			var elActiveContext = $('context_option_' + appid + '_' + contextid);
			if ( elActiveContext )
			{
				$('contextselect_activecontext').update( elActiveContext.clone( true ) );
			}

		}


		$('active_inventory_page').hide();
		$('empty_inventory_page').hide();
		$('pending_inventory_page').hide();
		$('failed_inventory_page').hide();

		if ( g_ActiveInventory.BIsPendingInventory() )
		{
			$('pending_inventory_page').show();

			if ( assetid )
				g_deferredAsset = assetid;
		}
		else if ( g_ActiveInventory.BIsEmptyInventory() )
		{
			$('empty_inventory_page').show();

			$('empty_inventory_page').down('.gamename').update( g_rgAppContextData[appid].name );
			var strHowToGet = '';
			if( oEconomyDisplay && oEconomyDisplay.howtoget )
				strHowToGet = oEconomyDisplay.howtoget;
			$('empty_inventory_page_howtoget').update( strHowToGet );
		}
		else
		{
			$('active_inventory_page').show();

			SetCookie( 'strInventoryLastContext', appid + '_' + contextid, 14 );
		}

		// hide the tags after we select the new inventory so
		// we can show the "show" button appropriately.
		HideTagFilters();
	}
	else
	{
		// we already had this inventory selected.  Only continue if we are changing assetid
		if ( !assetid )
			return;
	}

	// highlight an item for this game's inventory
	var rgItem = null;

	if ( g_ActiveInventory.BIsEmptyInventory() )
		return;

	if ( assetid )
	{
		// either the passed in item ...
		rgItem = g_ActiveInventory.LocateAsset( assetid );
	}
	if ( !rgItem )
	{
		// ... or the last selected item ...
		rgItem = g_ActiveInventory.selectedItem;
	}
	if ( !rgItem || rgItem.element.parentNode.filtered )
	{
		// ... or the first (non-filtered) item listed
		for ( var iPage = 0; iPage < g_ActiveInventory.pageList.length; iPage++ )
		{
			var rgItemHolders = g_ActiveInventory.pageList[iPage].childElements();
			for ( var i = 0; i < rgItemHolders.length; i++ )
			{
				if ( rgItemHolders[i].filtered )
					continue;
				var elItem = $(rgItemHolders[i]).down('div.item');
				if ( elItem )
				{
					rgItem = elItem.rgItem;
					break;
				}
			}
			if ( rgItem ) break;
		}
	}
	if ( rgItem )
	{
		g_ActiveInventory.SelectItem( null, rgItem.element, rgItem );
		g_ActiveInventory.EnsurePageActiveForItem( rgItem.element );
	}
}

function SelectInventory( appid, contextid, bForceSelect )
{
	var inventory = UserYou.getInventory( appid, contextid );
	if ( inventory == g_ActiveInventory && !bForceSelect )
	{
		return false;
	}

	if ( g_ActiveInventory )
	{
		g_ActiveInventory.hide();
	}
	g_ActiveInventory = inventory;
	if ( !inventory.initialized )
	{
		inventory.Initialize();
	}

	inventory.MakeActive();

	return true;
}

/* special display rules for economy apps, logos, special messages, etc */
var g_rgEconomyDisplay = {"440":{"howtoget":"You can get them from free in-game item drops, the in-game Mann Co. Store, or trade for them with friends."},"620":{"howtoget":"You can get them from the Portal 2 in-game store or trade for them with friends."},"753":{"1":{"howtoget":"You can get extra copies of games during special promotions, or by purchasing a game from the Steam Store and selecting \"Purchase as a Gift\" at checkout time."}},"99900":{"logo":"http:\/\/cdn.steamcommunity.com\/public\/images\/economy\/applogos\/99900.png"},"99920":{"logo":"http:\/\/cdn.steamcommunity.com\/public\/images\/economy\/applogos\/99900.png"}};
function GetEconomyDisplay( appid, contextid )
{
	var oDisplay = {};
	if ( g_rgEconomyDisplay[appid] )
	{
		if ( g_rgEconomyDisplay[appid][contextid] )
			oDisplay = g_rgEconomyDisplay[appid][contextid];
		else
			oDisplay = g_rgEconomyDisplay[appid];
	}

	if ( g_rgAppContextData[appid] && g_rgAppContextData[appid].inventory_logo )
		oDisplay.inventory_logo = g_rgAppContextData[appid].inventory_logo;
	else
		oDisplay.inventory_logo = oDisplay.logo;

	return oDisplay;
}

function ImageURL( imageName, x, y )
{
	if ( imageName )
	{
		x = x ? x : 0;
		y = y ? y : 0;
		var strSize = '';
		if ( x != 0 || y != 0 )
			strSize = '/' + x + 'x' + y;
		return 'http://cdn.steamcommunity.com/economy/image/' + v_trim(imageName) + strSize;
	}
	else
		return 'http://cdn.steamcommunity.com/public/images/trans.gif';
}


/*
 *		Hovers
 */
function MouseOverItem( event, owner, elItem, rgItem )
{
	// no hovers while the user is moving items around
	if ( g_bIsTrading && g_bInDrag )
		return;

	elItem.addClassName( 'hover' );
	var hover = $('hover');
	if ( hover.hiding && hover.visible() && hover.target == elItem )
	{
		ShowWithFade( hover );
	}
	else if ( ( !hover.visible() || hover.target != elItem ) && !elItem.timer )
	{
		elItem.wants_hover = true;
		// if the hover is visible, wait a bit to give it a chacne to disappear
		if ( hover.visible() )
			window.setTimeout( function() { if ( elItem.wants_hover ) BuildHover( 'hover', rgItem, owner ); }, Math.min( 250, ITEM_HOVER_DELAY - 50 ) );
		else
			BuildHover( 'hover', rgItem, owner );

		elItem.timer = window.setTimeout( function() { elItem.timer = false; if ( elItem.wants_hover ) ShowHover( elItem, rgItem ); elItem.wants_hover = false; }, ITEM_HOVER_DELAY );
	}
}

function MouseOutItem( event, owner, elItem, rgItem )
{
	var reltarget = (event.relatedTarget) ? event.relatedTarget : event.toElement;
	if ( reltarget && ( reltarget == elItem || ( $(reltarget).up( '#' + elItem.identify() ) ) ) )
		return;

	CancelItemHover( elItem );
}

function CancelItemHover( elItem )
{
	elItem.removeClassName( 'hover' );
	if ( elItem.wants_hover && elItem.timer )
	{
		window.clearTimeout( elItem.timer );
		elItem.wants_hover = false;
		elItem.timer = false;
	}
	else
		HideHover.defer();
}

var iActiveSelectView = 0;


var HoverCurrencyFromTemplate = new Template( '<span style="#{currencystyle}">#{amount}</span> from #{contextname}');
function BuildHover( prefix, item, owner )
{
	var imageName = item.icon_url_large ? item.icon_url_large : item.icon_url;
	var url = '';
	if ( g_bIsTrading )
		url = ImageURL( imageName, 192, 192 );
	else
		url = ImageURL( imageName, 330, 192 );

	var strHoverClass = 'item_desc_content';
	if ( item.appid )
		strHoverClass = strHoverClass + ' app' + item.appid + ' context' + item.contextid;
	$(prefix+'_content').className = strHoverClass;

	$(prefix+'_item_icon').src = url;

	var strName = item.name;
	if ( CurrencyIsWalletFunds( item ) )
		strName = v_currencyformat( item.amount, item.name ) + ' <span class="hover_item_name_small">' + strName + '</span>';
	else if ( item.is_stackable )
		strName = v_numberformat( item.amount ) + ' ' + strName;

	// Show the other user's currency in the name field.
	if ( CurrencyIsWalletFunds( item ) && typeof(g_rgWalletInfo) != 'undefined' &&
			g_rgWalletInfo['wallet_currency'] != g_rgWalletInfo['wallet_other_currency'] )
	{
		var bThisIsOurCurrency = ( g_rgWalletInfo['wallet_currency'] == ( item.id % 1000 ) );
		var bThisIsTheirCurrency = ( g_rgWalletInfo['wallet_other_currency'] == ( item.id % 1000 ) );

		if ( bThisIsOurCurrency )
		{
			var strTheirCurrency = GetCurrencyCode( g_rgWalletInfo['wallet_other_currency'] );
			strName += '<span class="hover_item_name_conversion"> / ' +
					v_currencyformat( ConvertToTheirCurrency( item.amount ), strTheirCurrency ) + ' <span class="hover_item_name_small">' + strTheirCurrency + '</span>' +
					'</span>';
		}
		else if ( bThisIsTheirCurrency )
		{
			// strName already contains their currency, so let's convert to our currency and display that first.
			var strOurCurrency = GetCurrencyCode( g_rgWalletInfo['wallet_currency'] );
			strName = v_currencyformat( ConvertToOurCurrencyForDisplay( item.amount ), strOurCurrency ) + ' <span class="hover_item_name_small">' + strOurCurrency + '</span>' +
					'<span class="hover_item_name_conversion"> / ' + strName + '</span>';
		}
	}

	$(prefix+'_item_name').update( strName );


	var elArrowLeft = $(prefix+'_arrow_left');
	var elArrowRight = $(prefix+'_arrow_right');
	if ( item.name_color )
	{
		$(prefix+'_item_name').style.color = '#' + item.name_color;
		$(prefix+'_content').parentNode.style.borderColor = '#' + item.name_color;
		if ( elArrowLeft ) elArrowLeft.style.borderRightColor = '#' + item.name_color;
		if ( elArrowRight ) elArrowRight.style.borderLeftColor = '#' + item.name_color;
	}
	else
	{
		$(prefix+'_item_name').style.color = '';
		$(prefix+'_content').parentNode.style.borderColor = '';
		if ( elArrowLeft ) elArrowLeft.style.borderRightColor = '';
		if ( elArrowRight ) elArrowRight.style.borderLeftColor = '';
	}

	var elFraudWarnings = $(prefix+'_fraud_warnings');
	if ( elFraudWarnings )
	{
		// on the inventory page, we only show fraud warnings for currency (special privacy notice)
		if ( item.fraudwarnings || ( g_bIsInventoryPage && item.is_currency ) )
		{
			elFraudWarnings.update( '' );
			if ( item.fraudwarnings )
			{
				for ( var i=0; i < item.fraudwarnings.length; i++ )
				{
					var warning = new Element( 'div' );
					warning.update( item.fraudwarnings[i] );
					elFraudWarnings.appendChild( warning );
				}
			}
			if ( g_bIsInventoryPage && item.is_currency )
			{
				var warning = new Element( 'div' );
				warning.update( 'This amount is private and shown only to you.' );
				elFraudWarnings.appendChild( warning );
			}
			elFraudWarnings.show();
		}
		else
		{
			elFraudWarnings.hide();
		}
	}
	
	if ( item.appid && g_rgAppContextData[item.appid] )
	{
		var rgAppData = g_rgAppContextData[item.appid];
		$(prefix+'_game_icon').src = rgAppData.icon;
		$(prefix+'_game_name').update( rgAppData.name );
		$(prefix+'_item_type').update( item.type );
		$(prefix+'_game_info').show();
	}
	else
	{
		$(prefix+'_game_info').hide();
	}

	var elDescriptors = $(prefix+'_item_descriptors');
	PopulateDescriptions( elDescriptors, item.descriptions );

	var elActions = $(prefix+'_item_actions');
	if ( elActions )
	{
		PopulateActions( elActions, item.actions, item );
	}

	var elOwnerDescriptors = $(prefix+'_item_owner_descriptors');
	if ( elOwnerDescriptors )
	{
		PopulateDescriptions( elOwnerDescriptors, item.owner_descriptions )
	}

	var elOwnerActions = $(prefix+'_item_owner_actions');
	if ( elOwnerActions )
	{
		PopulateActions( elOwnerActions, item.owner_actions, item );
	}

	var elCurrencyInTradeDescriptor = $(prefix+'_currency_in_trade' );
	if ( elCurrencyInTradeDescriptor )
	{
		elCurrencyInTradeDescriptor.update('');
		if ( item.is_currency && item.parent_currency && owner == UserYou )
		{
			// this item is currency in a trade, display how much is being offered
			var rgContext = owner && owner.GetContext( item.appid, item.contextid );
			var oParams = {};
			oParams.amount = v_numberformat( item.amount );
			oParams.contextname = rgContext ? rgContext.name : '' ;
			oParams.currencystyle = item.name_color ? 'color: #' + item.name_color + ';' : '';
			elCurrencyInTradeDescriptor.update( HoverCurrencyFromTemplate.evaluate( oParams ) );
		}
	}

	var elTags = $(prefix+'_item_tags');
	var elTagsContent = $(prefix+'_item_tags_content');
	if ( elTags && elTagsContent )
	{
		PopulateTags( elTags, elTagsContent, item.tags );
	}


	$(prefix).builtFor = item;
	$(prefix).builtForAmount = item.amount;
}

function PopulateDescriptions( elDescriptions, rgDescriptions )
{
	elDescriptions.update('');
	if ( !rgDescriptions )
		return;
	for ( var i = 0; i < rgDescriptions.length; i++ )
	{
		var description = rgDescriptions[i];
		if ( !description.value )
			continue;
		
		var elDescription = new Element( 'div', {'class': 'descriptor' } );
		if ( description.color )
			elDescription.style.color = '#' + description.color;

		// just use a blank space for an empty string
		if ( v_trim( description.value ).length == 0 )
		{
			elDescription.update( '&nbsp;' );
		}
		else if ( description.type == 'image' )
		{
			var elImage = new Element( 'img', {src: description.value } );
			elDescription.appendChild( elImage );
		}
		else
		{
			elDescription.update( description.value.replace( /\n/g, '<br>' ) );
		}

		if ( description.label )
		{
			var elLabel = new Element( 'span', {'class': 'descriptor_label' } );
			elLabel.update( description.label + ': ' );
			elDescription.insert( { top: elLabel } );
		}

		elDescriptions.appendChild( elDescription );
	}
}

function PopulateActions( elActions, rgActions, item )
{
	elActions.update('');
	if ( !rgActions )
	{
		elActions.hide();
		return;
	}
	for ( var i = 0; i < rgActions.length; i++ )
	{
		var action = rgActions[i];
		if ( !action.link || !action.name )
			continue;
		var elAction = new Element( 'a', {'class': 'item_action', href: action.link.replace("%assetid%", item.id) } );
		elAction.update( action.name );
		elActions.appendChild( elAction );
	}
	elActions.show();
}

function PopulateTags( elTags, elTagsContent, rgTags )
{
	elTagsContent.update('');
	if ( !rgTags )
	{
		elTags.hide();
		return;
	}

	var sTagList = "";
	for ( var i = 0; i < rgTags.length; i++ )
	{
		var tag = rgTags[i];
		if ( !tag.name )
			continue;

		if( sTagList != "" )
			sTagList += ", ";

		sTagList += tag.name;
	}

	if( sTagList != "" )
	{
		elTags.show();
		elTagsContent.update( sTagList );
	}
	else
	{
		elTags.hide();
	}
}


function ShowHover( elem, item )
{
	var hover = $('hover');
	if ( hover.target != elem || hover.builtFor != item || hover.builtForAmount != item.amount )
	{
		if ( hover.target )
			hover.target.removeClassName('hover');

		BuildHover( 'hover', item );
		hover.target = elem;
	}
	
	var divHoverContents = hover.down( '.hover_box' );
	
	hover.style.visibility = 'hidden';
	hover.show();

	hover.clonePosition( elem, {setWidth: false, setHeight: false} );
	var hover_box = hover.down( '.hover_box' );
	var hover_arrow_left = hover.down( '.hover_arrow_left' );
	var hover_arrow_right = hover.down( '.hover_arrow_right' );


	var hover_arrow = hover_arrow_left;

	var nHoverHorizontalPadding = (hover_arrow ? -4 : 8);
	var boxRightViewport = elem.viewportOffset().left + parseInt( elem.getDimensions().width ) + hover_box.getWidth() + ( 24 - nHoverHorizontalPadding );
	var nSpaceRight = document.viewport.getWidth() - boxRightViewport;
	var nSpaceLeft = parseInt( hover.style.left ) - hover.getWidth();
	if ( boxRightViewport > document.viewport.getWidth() && nSpaceLeft > nSpaceRight)
	{
				hover.style.left = ( parseInt( hover.style.left ) - hover.getWidth() + nHoverHorizontalPadding ) + 'px';
		hover_arrow = hover_arrow_right;
	}
	else
	{
				hover.style.left = ( parseInt( hover.style.left ) + parseInt( elem.getDimensions().width ) - nHoverHorizontalPadding ) + 'px';
	}

	if ( hover_arrow )
	{
		hover_arrow_left.hide();
		hover_arrow_right.hide();
		hover_arrow.show();
	}

	var nTopAdjustment = 0;

			if ( elem.getDimensions().height < 98 )
		nTopAdjustment =  elem.getDimensions().height / 2 - 49;
	hover.style.top = ( ( parseInt( hover.style.top ) - 13 ) + nTopAdjustment ) + 'px';

	var boxTopViewport = elem.viewportOffset().top + nTopAdjustment;
	if ( boxTopViewport + hover_box.getHeight() + 8 > document.viewport.getHeight() )
	{
		var nViewportAdjustment = ( hover_box.getHeight() + 8 ) - ( document.viewport.getHeight() - boxTopViewport );
				nViewportAdjustment = Math.min( hover_box.getHeight() - 74, nViewportAdjustment );
		hover.style.top = ( parseInt( hover.style.top ) - nViewportAdjustment ) + 'px';

		if ( hover_arrow )
			hover_arrow.style.top = ( 48 + nViewportAdjustment ) + 'px';
	}
	else
	{
		if ( hover_arrow )
			hover_arrow.style.top = '';
	}

	hover.hide();
	hover.style.visibility = '';
	
	if ( BShouldSuppressFades() )
	{
		hover.show();
	}
	else
		ShowWithFade( hover );
}

function HideHover()
{
	var hover = $('hover');
	
	if ( !hover.visible() || !hover.target )
		return;
	
	hover.target.removeClassName('hover');
	
	if ( BShouldSuppressFades() )
		hover.hide();
	else
		HideWithFade( hover );
}

function InventoryDismissPurchaseMessage()
{
	new Effect.BlindUp( $('economy_popup_msg'), {duration: 0.25} );
}


var Filter = {

	strLastFilter: '',
	elFilter: null,
	rgLastTags: {},
	rgCurrentTags: {},

	InitFilter: function( elFilter )
	{
		this.strLastFilter = '';
		this.elFilter = elFilter;

		elFilter.observe( 'keyup', this.OnFilterChange.bind( this ) );
		elFilter.observe( 'blur', this.OnFilterChange.bind( this ) );
		elFilter.observe( 'click', this.OnFilterChange.bind( this ) );
		elFilter.observe( 'paste', this.FilterOnPaste.bind( this ) );
		elFilter.observe( 'cut', this.FilterOnPaste.bind( this ) );
		$('filter_clear_btn').observe( 'click', this.ClearTextFilter.bind( this ) );
	},

	ClearTextFilter: function()
	{
		this.elFilter.value = '';
		this.OnFilterChange();
	},

	ClearFilter: function()
	{
		this.elFilter.value = '';
		this.rgLastTags = this.rgCurrentTags;
		this.rgCurrentTags = {};
		this.OnFilterChange();
	},

	FilterOnPaste: function( event )
	{
		this.OnFilterChange.bind(this).defer();
	},

	OnFilterChange: function()
	{
		this.ApplyFilter( this.elFilter.value );
	},

	ReApplyFilter: function()
	{
		/* erase the filter so visibilty will be recalculated - should store last filter at inventory level */
		if ( g_ActiveInventory.bFilterApplied && this.strLastFilter.length == 0 )
		{
			this.strLastFilter = 'x';
			this.ApplyFilter( this.elFilter.value );
		}
		else
		{
			this.strLastFilter = '';
			this.ApplyFilter( this.elFilter.value );
		}
	},

	UpdateTagFiltering: function( rgNewTags )
	{
		this.rgLastTags = this.rgCurrentTags;
		this.rgCurrentTags = rgNewTags;
		this.ApplyFilter( this.elFilter.value );
	},

	ApplyFilter: function( filterValue, elInsertedItem )
	{
		if ( !g_ActiveInventory || g_ActiveInventory.BIsEmptyInventory() )
			return;

		var filter = v_trim( filterValue );

		if( filter == this.strLastFilter && !Object.values( this.rgCurrentTags ).length && !Object.values( this.rgLastTags ).length )
			return;

		var bRestricting = true;
		var bLoosening = true;
		if ( elInsertedItem )
			bRestricting = bLoosening = false;

		// if it's the text filter that changed, turn on the loosening/restricting optimization
		if ( filter != this.strLastFilter )
		{
			if ( this.strLastFilter && this.strLastFilter.startsWith( filter ) )
				bRestricting = false;
			else if ( !this.strLastFilter || filter.startsWith( this.strLastFilter ) )
				bLoosening=false;
		}

		this.strLastFilter = filter;

		var rgTerms = filter.length ? filter.split( ' ' ) : false;
		for( var i = 0; i < rgTerms.length; i++ )
		{
			// wrap each string in a case-insensitive regexp (using prototype's escape function)
			rgTerms[i] = new RegExp( RegExp.escape( rgTerms[i] ), 'i' );
		}


		var rgNewItemList = Array();
		var rgPages = g_ActiveInventory.pageList;
		var rgForwardInserts = { };
		var cElementsDisplayed = 0;
		for (var iPage = 0; iPage < rgPages.length; iPage++ )
		{
			var page = rgPages[iPage];
			var iCarryoverInserts = 0;

			if ( rgForwardInserts[iPage] )
			{
				// new items became visible on the first page, pushing some items on to this page
				for( var i = rgForwardInserts[iPage].length - 1; i >=0; i-- )
				{
					page.insertBefore( rgForwardInserts[iPage][i].remove(), page.firstChild );
					iCarryoverInserts++;
				}
			}

			var rgChildren = page.childElements();
			for ( var iChild = 0; iChild < rgChildren.length; iChild++ )
			{
				// skip any items that were pushed on to this page from the previous page - they've already been processed
				if ( iCarryoverInserts > 0 )
				{
					iCarryoverInserts--;
					continue;
				}

				var elItemHolder = rgChildren[iChild];
				var elItem = elItemHolder.firstChild;
				var bVisible = !elItemHolder.filtered;
				if ( bVisible && bRestricting )
				{
					var bHide = !this.MatchItem( elItem, rgTerms, this.rgCurrentTags );
					if ( bHide )
					{
						elItemHolder.hide();
						elItemHolder.filtered = true;
					}
				}
				else if ( !bVisible && ( bLoosening || elInsertedItem && elItem == elInsertedItem ) )
				{
					var bShow = this.MatchItem( elItem, rgTerms, this.rgCurrentTags );
					if ( bShow )
					{
						elItemHolder.show();
						elItemHolder.filtered=false;
					}
				}
				if ( !elItemHolder.filtered )
					cElementsDisplayed++;
				var iCorrectPage = Math.floor( (cElementsDisplayed > 0 ? cElementsDisplayed - 1 : 0 ) / INVENTORY_PAGE_ITEMS );
				if ( iCorrectPage != iPage )
				{
					if ( iCorrectPage > iPage )
					{
						if ( !rgForwardInserts[iCorrectPage] )
							rgForwardInserts[iCorrectPage] = new Array();
						rgForwardInserts[iCorrectPage].push( elItemHolder );
					}
					else
					{
						rgPages[iCorrectPage].appendChild( elItemHolder.remove() );
						g_ActiveInventory.LoadItemImage( elItem );
					}
				}
			}
		}

		// blue border around filtered items
		if ( filter.length || Object.values( this.rgCurrentTags ).length )
		{
			$('inventories').addClassName( 'filtered' );
			g_ActiveInventory.bFilterApplied = true;
		}
		else
		{
			$('inventories').removeClassName( 'filtered' );
			g_ActiveInventory.bFilterApplied = false;
		}

		// blue border around the text box
		if( filter.length )
		{
			 if( $('filter_control') )
			{
				$('filter_control').addClassName( 'filtered' );
				$('filter_clear_btn').show();
			}
		}
		else
		{
			if( $('filter_control') )
			{
				$('filter_control').removeClassName( 'filtered' );
				$('filter_clear_btn').hide();
			}
		}

		// blue border around the tag controls
		if ( Object.values( this.rgCurrentTags ).length )
		{
			if( $('filter_options') )
			   $('filter_options').removeClassName( 'filtered' );
		}
		else
		{
			if( $('filter_options') )
			   $('filter_options').removeClassName( 'filtered' );
		}

		if( cElementsDisplayed == 0 )
		{
			if( $( 'empty_filtered_inventory_page' ) )
			{
				$( 'empty_filtered_inventory_page' ).show();
				$( 'active_inventory_page' ).hide();
			}
		}
		else
		{
			if( $( 'empty_filtered_inventory_page' ) )
			{
				$( 'empty_filtered_inventory_page' ).hide();
				$( 'active_inventory_page' ).show();
			}
		}

		// adjust page controls.  If the active page no longer has any items, dump the user on the first (0th) page
		var cNewMaxPages = Math.ceil( (cElementsDisplayed > 0 ? cElementsDisplayed - 1 : 0 ) / INVENTORY_PAGE_ITEMS );
		g_ActiveInventory.pageTotal = cNewMaxPages;
		if ( g_ActiveInventory.pageCurrent >= cNewMaxPages )
		{
			g_ActiveInventory.SetActivePage(0);
		}
		g_ActiveInventory.UpdatePageCounts();
	},

	MatchItem: function( elItem, rgTerm, rgCategories )
	{
		if ( !rgTerm && !Object.values( rgCategories ).length)
			return true;

		if ( !elItem || !elItem.rgItem || !elItem.rgItem.name )
			return false;

		return this.MatchItemCategories( elItem, rgCategories )
			&& this.MatchItemTerms( elItem, rgTerm );
	},

	// match a tag in every category. This is an AND
	MatchItemCategories: function( elItem, rgCategories )
	{
		if( Object.values( rgCategories ).length > 0 && (!elItem.rgItem.tags || !elItem.rgItem.tags.length ) )
			return false;

		for( sCategoryName in rgCategories )
		{
			if( typeof sCategoryName != "string" )
				continue;

			if( !this.MatchItemTags( elItem, rgCategories[ sCategoryName ] ) )
				return false;
		}

		return true;
	},

	// match any tag within a category. This is an OR
	MatchItemTags: function( elItem, rgTags )
	{
		for( var iTag = 0; iTag < rgTags.length; iTag++ )
		{
			var sTag = rgTags[ iTag ];
			for( var iItemTag = 0; iItemTag < elItem.rgItem.tags.length; iItemTag++ )
			{
				var rgItemTag = elItem.rgItem.tags[ iItemTag ];
				if( rgItemTag.internal_name == sTag )
				{
					return true;
				}
			}
		}

		return false;
	},

	MatchItemTerms: function( elItem, rgTerms )
	{
		if ( !rgTerms )
			return true;

		var name = elItem.rgItem.name;
		var type = elItem.rgItem.type;
		var descriptions = elItem.rgItem.descriptions;

		for ( var iTerm = 0; iTerm < rgTerms.length; iTerm++ )
		{
			var bMatch = false;
			if ( name.match( rgTerms[iTerm] ) || ( type && type.match( rgTerms[iTerm] ) ) )
			{
				bMatch = true;
			}
			if ( !bMatch && descriptions && descriptions.length )
			{
				for ( var i = 0; i < descriptions.length; i++ )
				{
					if ( descriptions[i].value && descriptions[i].value.match( rgTerms[iTerm] ) )
					{
						bMatch = true;
						break;
					}
				}
			}
			if ( !bMatch )
				return false;
		}

		return true;
	}
};

function CreateCurrencyHoverFromContainer( container, id, appid, contextid, currencyid, amount )
{
	var element = $(id);
	var rgItem = container[appid][currencyid];
	if ( !rgItem )
		return;
	rgItem = Object.clone( rgItem );
	rgItem.appid = appid;
	rgItem.contextid = contextid;
	rgItem.amount = amount;
	element.observe( 'mouseover', MouseOverItem.bindAsEventListener( null, UserYou, element, rgItem ) );
	element.observe( 'mouseout', MouseOutItem.bindAsEventListener( null, UserYou, element, rgItem ) );
}

function CreateItemHoverFromContainer( container, id, appid, contextid, assetid, amount )
{
	var element = $(id);
	var rgItem = container[appid][contextid][assetid];
	if ( !rgItem )
		return;
	rgItem.appid = appid;
	rgItem.contextid = contextid;
	rgItem.amount = amount;
	rgItem.is_stackable = amount > 1;
	element.observe( 'mouseover', MouseOverItem.bindAsEventListener( null, UserYou, element, rgItem ) );
	element.observe( 'mouseout', MouseOutItem.bindAsEventListener( null, UserYou, element, rgItem ) );
}

/* trade history page */
function HistoryPageCreateCurrencyHover( id, appid, contextid, currencyid, amount )
{
	CreateCurrencyHoverFromContainer( g_rgHistoryCurrency, id, appid, contextid, currencyid, amount );
}

function HistoryPageCreateItemHover( id, appid, contextid, assetid, amount )
{
	CreateItemHoverFromContainer( g_rgHistoryInventory, id, appid, contextid, assetid, amount );
}

function MergeInventoryWithDescriptions( rgInventory, rgCurrency, rgDescriptions )
{
	var rgMergedInventory = null;
	var rgMergedCurrency = null;

	if ( rgInventory && !( rgInventory instanceof Array ) )
	{
		rgMergedInventory = {};
		for ( var itemid in rgInventory )
		{
			var rgItem = rgInventory[itemid];
			if ( rgItem )
			{
				rgMergedInventory[itemid] = Object.extend( rgItem, Object.clone( rgDescriptions[rgItem.classid + '_' + rgItem.instanceid] ) );

				// each item needs its own tags
				if ( rgItem.tags )
				{
					rgMergedInventory[itemid].tags = rgMergedInventory[itemid].tags.clone();
				}
			}
		}
	}
	else
	{
		rgMergedInventory = rgInventory;
	}

	if ( rgCurrency && !( rgCurrency instanceof Array ) )
	{
		rgMergedCurrency = {};
		for ( var itemid in rgCurrency )
		{
			var rgItem = rgCurrency[itemid];
			if ( rgItem )
			{
				rgMergedCurrency[itemid] = Object.extend( rgItem, Object.clone( rgDescriptions[rgItem.classid + '_' + 0] ) );

				// each item needs its own tags
				if ( rgItem.tags )
				{
					rgMergedCurrency[itemid].tags = rgMergedCurrency[itemid].tags.clone();
				}
			}
		}
	}
	else
	{
		rgMergedCurrency = rgCurrency;
	}

	return { inventory: rgMergedInventory, currency: rgMergedCurrency };
}

CNewItemScroller = Class.create( {

	m_rgPageOffsets: [],
	m_iPage: 0,

	m_elScroller: null,
	m_elRightControl: null,
	m_elLeftControl: null,

	m_bInTransition: false,

	initialize: function( elScroller, elRightControl, elLeftControl )
	{
		this.m_elScroller = $(elScroller);
		this.m_elRightControl = $(elRightControl);
		this.m_elLeftControl = $(elLeftControl);

		this.CalculatePages();
		if ( this.m_rgPageOffsets.length > 1 )
			this.m_elRightControl.show();

		this.m_elRightControl.observe( 'click', this.ScrollNext.bind( this ) );
		this.m_elLeftControl.observe( 'click', this.ScrollPrevious.bind( this ) );
	},

	CalculatePages: function()
	{
		var rgItems = this.m_elScroller.childElements();

		this.m_rgPageOffsets = [ 0 ];

		var iPage = 0;
		// we start with a negative accumulated width because we have some extra space on the intial page due
		//	to no previous page button
		var nAccumWidth = -20;
		var nLastPageOffset = 0;
		var nMaxWidth = $(this.m_elScroller.parentNode).getWidth() - 50;
		var nItemMargin = 10;

		for ( var iItem = 0; iItem < rgItems.length; iItem++ )
		{
			var elItem = rgItems[iItem];
			var nItemWidth = elItem.getWidth();

			if ( ( nAccumWidth - nLastPageOffset ) + nItemWidth > nMaxWidth )
			{
				this.m_rgPageOffsets.push( nAccumWidth );
				iPage++;
				nLastPageOffset = nAccumWidth;
				nAccumWidth += nItemWidth + nItemMargin;
			}
			else
			{
				nAccumWidth += nItemWidth + nItemMargin;
			}
		}
	},

	ScrollPrevious: function()
	{
		this.ScrollTo( this.m_iPage - 1 );
	},

	ScrollNext: function()
	{
		this.ScrollTo( this.m_iPage + 1 );
	},

	ScrollTo: function( iPage )
	{
		if ( iPage < 0 || iPage > this.m_rgPageOffsets.length || this.m_bInTransition )
			return;

		var nOffset = this.m_rgPageOffsets[ iPage ];

		this.m_bInTransition = true;

		new Effect.Morph( this.m_elScroller, { style: 'left: -' + nOffset + 'px;', duration: 0.5, afterFinish: this.OnScrollComplete.bind(this) } );

		this.m_iPage = iPage;

		if ( this.m_iPage < this.m_rgPageOffsets.length - 1 )
			this.m_elRightControl.show();
		else
			this.m_elRightControl.hide();

		if ( this.m_iPage > 0 )
			this.m_elLeftControl.show();
		else
			this.m_elLeftControl.hide();
	},

	OnScrollComplete: function()
	{
		this.m_bInTransition = false;
	}

} );

function InventoryDismissNewItems( elNewItems )
{
	new Effect.BlindUp( elNewItems, {duration: 0.5 } );
	document.cookie='tsNewItemsPreviousLastChecked=0';
}

function CurrencyIsWalletFunds( currency )
{
	return currency.appid == 753 && currency.contextid == 4;
}

function ConvertToTheirCurrency( amount )
{
	var flAmount = amount * g_rgWalletInfo['wallet_conversion_rate'];
		var nAmount = Math.floor( isNaN(flAmount) ? 0 : flAmount );

	return Math.max( nAmount, 0 );
}

function ConvertToOurCurrency( amount )
{
		var flAmount = g_rgWalletInfo['wallet_inverse_conversion_rate'] * ( amount  );

	var nAmount = Math.ceil( isNaN(flAmount) ? 0 : flAmount );
	nAmount = Math.max( nAmount, 0 );

	// verify the amount. we may be off by a cent.
	if ( ConvertToTheirCurrency( nAmount ) != amount )
	{
		var i;
		for ( i = nAmount - 2; i <= nAmount + 2; i++ )
		{
			if ( ConvertToTheirCurrency( i ) == amount )
			{
				nAmount = i;
				break;
			}
		}
	}

	return nAmount;
}

function ConvertToOurCurrencyForDisplay( amount )
{
	var flAmount = amount * g_rgWalletInfo['wallet_inverse_conversion_rate'];
		var nAmount = Math.floor( isNaN(flAmount) ? 0 : flAmount );

	return Math.max( nAmount, 0 );
}
