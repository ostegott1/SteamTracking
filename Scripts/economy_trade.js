


var TRADE_UPDATE_INTEVRAL = 1000;
var MESSAGE_TRADE_PARTNER_ABSENSE_TIME = 5;
var g_bWalletBalanceWouldBeOverMax = false;
var g_nItemsFromContextWithNoPermissionToReceive = 0;

function BeginTrading()
{
	SizeWindow();

	INVENTORY_PAGE_ITEMS = 16;	//4 x 4 grid
	INVENTORY_PAGE_WIDTH = 104 * 4;
	g_bIsTrading = true;
	g_bShowTradableItemsOnly = true;

	
	if ( g_bTradePartnerProbation )
	{
		var elEvent = new Element( 'div', {'class': 'logevent' } );
		elEvent.update(
				'<%1$s>Warning:<%2$s> %3$s was recently trade banned and is currently on probation. %4$s may not be trustworthy.'
					.replace( '%1$s', 'span class="warning"' )
					.replace( '%2$s', '/span' )
					.replace( '%3$s', g_strTradePartnerPersonaName )
					.replace( '%4$s', g_strTradePartnerPersonaName ) );
		$('log').appendChild( elEvent );
	}

	// set up inventory and drag drop
	Droppables.add( $('trade_yours'), {hoverclass: 'readyForDrop', onDrop: OnDropItemInTrade } );

	// set up the filter control
	Filter.InitFilter( $('filter_control') );

	//set up chat controls
	var elChatEntry = $('chat_text_entry');
	elChatEntry.observe( 'keypress', OnChatKeypress );
	elChatEntry.observe( 'keyup', OnChatKeyup );
	elChatEntry.observe( 'paste', OnChatUpdate );
	elChatEntry.observe( 'cut', OnChatUpdate );
	$('chat_send_btn').observe( 'click', DoChat );

	// if the user starts typing in the trade dialog, move the focus to the chat control
	$(document).observe( 'keypress', TransferFocusToChat );
	
	Event.observe( window, 'resize', SizeWindow );
	Event.observe( window, 'unload', TradingUnloaded );

	RefreshTradeStatus( g_rgCurrentTradeStatus, true );
	RequestTradeStatusUpdate();

	// default to the last used inventory
	var oCookieParams = ReadInventoryCookie( GetCookie( 'strTradeLastInventoryContext' ) );
	if ( BValidateHashParams( oCookieParams ) )
		TradePageSelectInventory( oCookieParams.appid, oCookieParams.contextid );
}


var UserThem = Object.extend( new CUser(), {

	GetContext: function( appid, contextid ) {
		// TODO: load trade partner app contexts
		if ( !this.rgContexts[appid] )
			this.rgContexts[appid] = {};
		if ( !this.rgContexts[appid][contextid] )
			this.rgContexts[appid][contextid] = { inventory: null };
		return this.rgContexts[appid][contextid];
	},

	loadInventory: function( appid, contextid ) {
		this.LoadForeignAppContextData( g_ulTradePartnerSteamID, appid, contextid );
	},

	/*
	 *		Trading Partner's Inventory
	 */

	LoadForeignAppContextData: function( steamid, appid, contextid )
	{
		this.cLoadsInFlight++;
		this.addInventory( new CForeignInventoryPending( this, appid, contextid, null, null ) );
		var thisClosure = this;

		new Ajax.Request( 'http://steamcommunity.com/trade/' + g_ulTradePartnerSteamID + '/foreigninventory/', {
				method: 'post',
				parameters: {
					sessionid:	g_sessionID,
					steamid: 	steamid,
					appid:		appid,
					contextid:	contextid
				},
				onSuccess: function( transport ) { thisClosure.OnLoadForeignAppContextData( transport, appid, contextid ); }
			}
		);
		return true;
	},

	OnLoadForeignAppContextData: function( transport, appid, contextid )
	{
		this.cLoadsInFlight--;
		if ( transport.responseJSON && transport.responseJSON.success )
		{
			var rgAppInfo = transport.responseJSON.rgAppInfo;
			// see if this is a new app the current user didn't know about
			if ( !g_rgAppContextData[appid] )
			{
				g_rgAppContextData[appid] = Object.clone(rgAppInfo);
			}

			var merged = MergeInventoryWithDescriptions( transport.responseJSON.rgInventory, transport.responseJSON.rgCurrency, transport.responseJSON.rgDescriptions );

			// replace the pending inventory object with the real inventory
			this.addInventory( new CForeignInventory( this, appid, contextid, merged.inventory, merged.currency ) );

			RefreshTradeStatus( g_rgCurrentTradeStatus, true );
		}
		else
		{
			// erase the pending inventory object so it will be reloaded
			this.rgInventories[appid][contextid] = null;
		}
	}
});

var templActiveApp = new Template( '<img src="#{icon}"> #{name}' );
var templAllContextName = new Template( 'All #{appname} Items');

function TradePageSelectInventory( appid, contextid, bLoadCompleted )
{
	HideMenu( $('appselect'), $('appselect_options') );
	Filter.ApplyFilter( '' );

	if ( SelectInventory( appid, contextid, bLoadCompleted ) )
	{
		Filter.ReApplyFilter();

		// copy the html of the chosen game option to the app select box
		var oAppDisplay = GetEconomyDisplay( appid, contextid );
		var rgAppData = g_rgAppContextData[appid];

		var displayName = rgAppData.name;
		if ( contextid == 0 )
		{
			//displayName = templAllContextName.evaluate( { appname: rgAppData.name } );
		}
		else if ( !UserYou.BIsSingleContextApp( appid ) )
		{
			displayName = displayName + ' ' + UserYou.GetContext( appid, contextid ).name;
		}

		$('appselect_activeapp').update( templActiveApp.evaluate( { icon: rgAppData.icon, name: displayName } ) );

		$('trade_inventory_unavailable').hide();
		$('trade_inventory_failed').hide();

		if ( g_ActiveInventory.BIsEmptyInventory() )
		{
			var appname = rgAppData.name;

			g_ActiveInventory.hide();
			$('trade_inventory_unavailable').show();

			$('trade_inventory_message_no_inventory').hide();
			$('trade_inventory_message_not_allowed').hide();
			$('trade_inventory_pending').hide();

			if ( g_ActiveInventory.BIsPendingInventory() )
			{
				$('trade_inventory_pending').show();
			}
			else if ( !UserYou.BAllowedToTradeItems( appid, contextid ) )
			{
				$('trade_inventory_message_not_allowed').show();
				if ( UserYou.BAllowedToRecieveItems( appid, contextid ) )
				{
					$('trade_inventory_message_not_allowed_none').hide();
					$('trade_inventory_message_not_allowed_receiveonly').show();

					$('trade_inventory_message_not_allowed_receiveonly').down('.gamename').update(appname);
				}
				else
				{
					$('trade_inventory_message_not_allowed_none').show();
					$('trade_inventory_message_not_allowed_receiveonly').hide();

					$('trade_inventory_message_not_allowed_none').down('.gamename').update(appname);
				}
				var elAlerts = $('trade_inventory_message_not_allowed_alerts');
				elAlerts.update('');
				if ( g_rgAppContextData[appid].alerts )
				{
					for( var i = 0; i < g_rgAppContextData[appid].alerts.length; i++ )
					{
						var alert = g_rgAppContextData[appid].alerts[i];
						var elAlert = new Element( 'div' );
						if ( alert.color )
							elAlert.style.color = '#' + alert.color;
						elAlert.update( alert.text );
						elAlerts.appendChild( elAlert );
					}
				}
			}
			else
			{
				$('trade_inventory_message_no_inventory').show();
				$('trade_inventory_message_no_inventory').down('.gamename').update(appname);
				var strHowToGet = '';
				if( oAppDisplay && oAppDisplay.howtoget )
					strHowToGet = oAppDisplay.howtoget;
				$('trade_inventory_message_no_inventory_howtoget').update( strHowToGet );
			}
		}
		else
		{
			Tutorial.OnSelectedNonEmptyInventory();
			SetCookie( 'strTradeLastInventoryContext', appid + '_' + contextid, 14, '/trade/' );
		}

		// hide the tags after we select the new inventory so
		// we can show the "show" button appropriately.
		HideTagFilters();
	}
}

/*
 *		Drag & Drop
 */


var g_bInDrag = false;

function MakeItemDraggable( element )
{
	element.style.zIndex = 3;
	new Draggable( element, {revert: 'failure', ghosting: false, onStart: StartDrag, onEnd: EndDrag } );
	Event.observe( element, 'dblclick', OnDoubleClickItem.bindAsEventListener( null, element ) );
}

function MakeCurrencyDraggable( element )
{
	element.style.zIndex = 3;
	// currency always reverts
	new Draggable( element, {revert: true, ghosting: true, onStart: StartDragCurrency, onEnd: EndDragCurrency } );
	Event.observe( element, 'dblclick', OnDoubleClickItem.bindAsEventListener( null, element ) );
}

function StartDragCurrency( draggable, event )
{
	draggable._clone.id = '';
	draggable._clone.removeClassName( 'hover' );
	StartDrag( draggable, event );

	draggable.element.addClassName( 'in_drag' );

	if ( typeof( draggable.element.drag_image ) != 'undefined' )
	{
		var elImage = draggable.element.select('img');
		if ( elImage )
		{
			draggable.element.drag_reset_image = elImage[0].src;
			elImage[0].src = draggable.element.drag_image;
		}
	}
}

function EndDragCurrency( draggable, event )
{
	// defer the end drag so our click event can operate on the g_bInDrag variable
	(function() {g_bInDrag = false;}).defer();

	draggable.element.removeClassName( 'in_drag' );

	if ( typeof( draggable.element.drag_reset_image ) != 'undefined' )
	{
		var elImage = draggable.element.select('img');
		elImage[0].src = draggable.element.drag_reset_image;
		delete draggable.element.drag_reset_image;
	}

	RemoveDroppable( $('inventories' ) );
}

function StartDrag( draggable, event )
{
	HideHover();
	if ( draggable.element.wants_hover )
		draggable.element.wants_hover = false;
	draggable.element.removeClassName( 'hover' );

	$('your_slots').childElements().invoke( 'removeClassName', 'nextTarget' );
	var item = draggable.element.rgItem;
	if ( BIsInTradeSlot( draggable.element ) )
	{
		Droppables.add( $('inventories' ) , {hoverclass: 'readyForDrop', onDrop: OnDropItemInInventory } );
		$(draggable.element.parentNode.parentNode).down('.slot_applogo').hide();
	}
	else if ( item.trade_stack && BIsInTradeSlot( item.trade_stack.element ) )
	{
		$(item.trade_stack.element.parentNode.parentNode).addClassName( 'nextTarget' );
	}
	else
	{
		var oSlotInfo = FindFreeSlot( $('your_slots' ) );
		oSlotInfo.elSlot.addClassName( 'nextTarget' );
	}

	g_bInDrag = true;
}

function EndDrag( draggable, event )
{
	g_bInDrag = false;
	draggable.element.style.zIndex = 5;

	if ( BIsInTradeSlot( draggable.element ) )
	{
		$(draggable.element.parentNode.parentNode).down('.slot_applogo').show();
	}

	RemoveDroppable( $('inventories' ) );
}

function RemoveDroppable( element )
{
	Droppables.remove( element );
}

function CleanupDraggable( elItem )
{
	elItem.style.zIndex = 5;

	// unset scriptaculous draggable stuff
	elItem.style.left = '';
	elItem.style.top = '';
	elItem.style.opacity = 1.0;

	elItem.removeClassName( 'in_drag' );
}

function OnDoubleClickItem( event, elItem )
{
	if ( BIsInTradeSlot( elItem ) )
	{
		MoveItemToInventory( elItem );
	}
	else
	{
		MoveItemToTrade( elItem );
	}
	CancelItemHover( elItem );
}

function OnDropItemInTrade( elItem, elTarget, event )
{
	CleanupDraggable( elItem );
	MoveItemToTrade( elItem );
}

function OnDropItemInInventory( elItem, elTarget, event )
{
	CleanupDraggable( elItem );
	MoveItemToInventory( elItem );
}

function ShowStackableItemDialog( elItem )
{
	var currency = elItem.rgItem;
	
	if ( currency.parent_item )
		return;

	// show transfer dialog
	PresentCurrencyDialog( currency );
}

function MoveItemToTrade( elItem )
{
	var item = elItem.rgItem;
	if ( item.is_stackable )
	{
		//stackable items present a dialog first, then will call FindSlotAndSetItem
		ShowStackableItemDialog( elItem );
	}
	else
	{
		FindSlotAndSetItem( item );
	}
}

function FindSlotAndSetItem( item, xferAmount )
{
	var elItem = item.element;
	var bStackable = item.is_stackable;
	if ( bStackable )
	{
		var stack = GetTradeItemStack( UserYou, item );
		elItem = stack.element;

		if ( xferAmount == 0 )
		{
			RemoveItemFromTrade( item );
			return;
		}
	}

	var iSlot = 0;

	// find a slot to drop this item in
	if ( !BIsInTradeSlot( elItem ) )
	{
		var oSlotInfo = FindFreeSlot( $('your_slots') );
		ReserveSlot( oSlotInfo.elSlot );
		iSlot = oSlotInfo.iSlot;
	}
	else
	{
		// stackable items will reuse their current slot
		iSlot = GetCurrentSlot( elItem );
	}

	if ( !BIsInTradeSlot( elItem ) || bStackable )
	{
		// commit the update
		SetItemInTrade( item, iSlot, xferAmount );
	}
}

function MoveItemToInventory( elItem )
{
	var item = elItem.rgItem;
	if ( BIsInTradeSlot( elItem ) )
	{
		CleanupSlot( elItem.parentNode.parentNode );
	}
	RevertItem( item );

	RemoveItemFromTrade( item );
}

function RemoveItemFromTrade( item )
{
	CancelTradeStatusPoll();
	new Ajax.Request( 'http://steamcommunity.com/trade/' + g_ulTradePartnerSteamID + '/removeitem/', {
		method: 'post',
		parameters: {
			sessionid: g_sessionID,
			appid: item.appid,
			contextid: item.contextid,
			itemid: item.id
		},
		onComplete: HandleDropFailure
	} );
}

function SetCurrencyInTrade( currency, xferAmount )
{
	CancelTradeStatusPoll();
	new Ajax.Request( 'http://steamcommunity.com/trade/' + g_ulTradePartnerSteamID + '/setcurrency/', {
			method: 'post',
			parameters: {
				sessionid: g_sessionID,
				appid: currency.appid,
				contextid: currency.contextid,
				currencyid: currency.id,
				amount: xferAmount
			},
			onSuccess: OnTradeStatusUpdate,
			onFailure: RequestTradeStatusUpdate
	} );
}

function SetItemInTrade( item, slot, xferAmount )
{
	CancelTradeStatusPoll();

	var params = {
				sessionid: g_sessionID,
				appid: item.appid,
				contextid: item.contextid,
				itemid: item.id,
				slot: slot
			};

	if ( xferAmount )
		params.amount = xferAmount;

	new Ajax.Request( 'http://steamcommunity.com/trade/' + g_ulTradePartnerSteamID + '/additem/', {
			method: 'post',
			parameters: params,
			onComplete: function( transport ) { HandleDropFailure( transport ); }
	} );
}

function SetStackableItemInTrade( item, xferAmount )
{
	if ( item.is_currency )
		SetCurrencyInTrade( item, xferAmount );
	else
		FindSlotAndSetItem( item, xferAmount );
}

// callback that handles SetItem or RemoveItem returning failure and puts the item back where it was
function HandleDropFailure( transport, fnOnFail )
{
	if ( !transport || !transport.responseJSON || !transport.responseJSON.success )
	{
		if ( fnOnFail )
			fnOnFail();
		RequestTradeStatusUpdate();
	}
	else
		OnTradeStatusUpdate( transport );
}

function RevertItem( item )
{
	if ( item.is_stackable )
	{
		// remove the currency from the trade by setting the amount in-trade to 0.
		SetStackableItemInTrade( item, 0 );
	}
	else
	{
		item.homeElement.appendChild( item.element.remove() );
		// if the inventory view is filtered, make sure the item applies
		if ( g_ActiveInventory && g_ActiveInventory.appid == item.appid && g_ActiveInventory.contextid == item.contextid )
			Filter.ApplyFilter( $('filter_control').value, item.element );
	}
}

/*
 * 		Trade slots
 */


function BIsInTradeSlot( element )
{
	return element.parentNode && $(element.parentNode).hasClassName( 'slot_inner' );
}

function GetCurrentSlot( element )
{
	if ( element.parentNode && element.parentNode.parentNode && $(element.parentNode.parentNode).hasClassName( 'trade_slot' ) )
	{
		return element.parentNode.parentNode.iSlot;
	}
	return 0;
}

function CreateCurrencyTradeSlot( bIsYourSlot, currency )
{
	var elSlotContainer = bIsYourSlot ? $('your_slots_currency') : $('their_slots_currency');
	var currencyId = currency.appid + '_' + currency.contextid + '_' + currency.id;
	var id = bIsYourSlot ? 'your_slot_currency_' + currencyId : 'their_slot_currency_' + currencyId;
	var elSlot = CreateSlotElement( id );
	elSlotContainer.appendChild( elSlot );
	return elSlot;
}

function CreateTradeSlot( bIsYourSlot, iSlot )
{
	var elSlotContainer = bIsYourSlot ? $('your_slots') : $('their_slots');
	var id = bIsYourSlot ? 'your_slot_' + iSlot : 'their_slot_' + iSlot;
	var elSlot = CreateSlotElement( id );
	elSlot.iSlot = iSlot;
	elSlotContainer.appendChild( elSlot );
	return elSlot;
}

function CreateSlotElement( id )
{
	var elSlot = new Element( 'div', { id: id, 'class': 'itemHolder trade_slot' } );
	elSlot.appendChild( new Element( 'div', {'class': 'slot_inner' } ) );
	var elAppLogo = new Element( 'div', {'class': 'slot_applogo' } );
	elAppLogo.style.display = 'none';
	elAppLogo.appendChild( new Element( 'img', {'class': 'slot_applogo_img' } ) );
	elSlot.appendChild( elAppLogo );
	return elSlot;
}

function FindFreeSlot( slotHolder )
{
	var slots = slotHolder.childElements();
	var slot = null;
	var elSlot = null;
	var iLastSlotInUse = 0;
	for ( var i = 0; i < slots.length; i++ )
	{
		if ( !slots[i].hasItem )
		{
			if ( !elSlot )
			{
				elSlot = slots[i];
				slot = i;
			}
		}
		else
		{
			iLastSlotInUse = Math.max( iLastSlotInUse, i );
		}
	}
	return { elSlot: elSlot, iSlot: slot, iLastSlotInUse: iLastSlotInUse };
}

function EnsureSufficientTradeSlots( bYourSlots, cSlotsInUse, cCurrencySlotsInUse )
{
	var elSlotContainer = bYourSlots ? $('your_slots') : $('their_slots');

	var cDesiredSlots = Math.max( Math.floor( ( cSlotsInUse + cCurrencySlotsInUse + 5 ) / 4 ) * 4, 8 );
	var cDesiredItemSlots = cDesiredSlots - cCurrencySlotsInUse;

	var cCurrentItemSlots = elSlotContainer.childElements().length;
	var cCurrentSlots = cCurrentItemSlots + cCurrencySlotsInUse;


	var bElementsChanged = false;
	var fnOnAnimComplete = null;
	if ( cDesiredSlots > cCurrentSlots )
	{
		for( var i = cCurrentItemSlots; i < cDesiredItemSlots; i++ )
		{
			CreateTradeSlot( bYourSlots, i );
		}
		bElementsChanged = true;
	}
	else if ( cDesiredSlots < cCurrentSlots )
	{
		// going to compact
		var prefix = bYourSlots ? 'your_slot_' : 'their_slot_';
		var rgElementsToRemove = new Array();
		for ( var i = cDesiredItemSlots; i < cCurrentItemSlots; i++)
		{
			var element = $(prefix + i );
			element.id='';
			$(elSlotContainer.parentNode).appendChild( element.remove() );
			rgElementsToRemove.push( element );
		}
		fnOnAnimComplete = function() { rgElementsToRemove.invoke('remove') };
		bElementsChanged = true;
	}
	if ( bElementsChanged )
	{
		var iNewHeight = 104 * Math.floor( cDesiredSlots / 4 );
		var elAnim = elSlotContainer.parentNode;
		if ( cCurrentSlots )
		{
			elAnim.style.overflow = 'hidden';
			if ( elAnim.effect )
				elAnim.effect.cancel();
			elAnim.effect = new Effect.Morph( $(elAnim), { style: 'height:' + iNewHeight + 'px;', duration: 0.25, afterFinish: function() { if ( fnOnAnimComplete ) { fnOnAnimComplete(); } elAnim.style.overflow='visible'; } } );
		}
		else
		{
			elAnim.style.height = iNewHeight + 'px';
		}
	}
}

function ReserveSlot( elSlot )
{
	elSlot.hasItem = true;
}

function PutItemInSlot( elItem, elSlot )
{
	var item = elItem.rgItem;
	if ( elItem.parentNode )
		elItem.remove();
	elSlot.down('.slot_inner').appendChild( elItem );

	if ( item && item.appid && g_rgAppContextData[item.appid] )
	{
		var rgAppData = g_rgAppContextData[item.appid];
		elSlot.down('.slot_applogo_img').src = rgAppData.icon;
		elSlot.down('.slot_applogo').show();
	}
	else
	{
		elSlot.down('.slot_applogo').hide();
	}
	elSlot.hasItem = true;
}

function CleanupSlot( elSlot )
{
	$(elSlot).down('.slot_applogo').hide();
	elSlot.hasItem = false;
}

/*
 *		Update polling
 */

var g_bPollInFlight = false;
var g_bPeriodicPollCancelledInFlight = false;
var g_cTradePollFailures = 0;
var g_iNextLogPos = 0;

var g_timerTradePoll = null;
var g_rgLastFullTradeStatus = null;
var g_cItemsInTrade = 0;
var g_cCurrenciesInTrade = 0;

function RequestTradeStatusUpdate()
{
	GetTradeStatus();
}

function GetTradeStatus()
{
	if ( g_bPollInFlight )
		return;

	CancelTradeStatusPoll();
	g_bPollInFlight = true;
	new Ajax.Request( 'http://steamcommunity.com/trade/' + g_ulTradePartnerSteamID + '/tradestatus/', {
			method: 'post',
			parameters: { sessionid: g_sessionID, logpos: g_iNextLogPos, version: g_rgCurrentTradeStatus.version },
			onSuccess: OnPeriodicTradeStatusUpdate,
			onFailure: OnTradeStatusFailure
		}
	);
}

function OnPeriodicTradeStatusUpdate( transport )
{
	// if we got cancelled in flight because some other user-action (added item to trade, readied, etc)
	//	then don't process this update, the user action will return the latest status
	g_bPollInFlight = false;
	if ( g_bPeriodicPollCancelledInFlight )
	{
		g_bPeriodicPollCancelledInFlight = false;
		QueueNextTradeStatusUpdateRequest();
		return;
	}
	else
	{
		OnTradeStatusUpdate( transport );
	}
}

function OnTradeStatusUpdate( transport )
{
	try {
		if ( transport.responseJSON && transport.responseJSON.success )
		{
			rgNewTradeStatus = transport.responseJSON;

			if ( rgNewTradeStatus.trade_status == 1 )
			{
				// we're done here
				Tutorial.OnCompletedTutorial();
				StopWatchingForUnload();
				window.location = 'http://steamcommunity.com/trade/' + rgNewTradeStatus.tradeid + '/receipt/';
				return;
			}
			else if ( rgNewTradeStatus.trade_status == 3 )
			{
				var url = 'http://steamcommunity.com/trade/' + g_ulTradePartnerSteamID + '/cancelled/';
				if ( g_bRequestedCancel )
					url += '?requestedCancel=1';
				StopWatchingForUnload();
				window.location =  url;
				return;
			}
			else if ( rgNewTradeStatus.trade_status == 4 )
			{
				var url = 'http://steamcommunity.com/trade/' + g_ulTradePartnerSteamID + '/';
				if ( $('trade_theirs_timeout').visible() )
					url += '?partnerTimeout=1';
				StopWatchingForUnload();
				window.location = url;
				return;
			}
			else if ( rgNewTradeStatus.trade_status == 5 )
			{
				var url = 'http://steamcommunity.com/trade/' + rgNewTradeStatus.tradeid + '/failed/';
				StopWatchingForUnload();
				window.location = url;
				return;
			}
			else if ( rgNewTradeStatus.trade_status != 0 || !rgNewTradeStatus.me || !rgNewTradeStatus.them )
			{
				// missing expected data- treat this as a failure
				OnTradeStatusFailure();
				return;
			}

			RefreshTradeStatus( rgNewTradeStatus );
			g_rgCurrentTradeStatus = rgNewTradeStatus;
			g_cTradePollFailures = 0;
		}
		else
		{
			OnTradeStatusFailure();
		}
	}
	catch ( e )
	{
		// error updating trade status
		OnTradeStatusFailure();
	}
	QueueNextTradeStatusUpdateRequest();
}

function OnTradeStatusFailure()
{
	g_bPollInFlight = false;
	
	if ( g_cTradePollFailures++ > 3 )
	{
		StopWatchingForUnload();
		window.location = window.location;
	}

	QueueNextTradeStatusUpdateRequest();
}

function CancelTradeStatusPoll()
{
	if ( g_timerTradePoll )
	{
		window.clearTimeout( g_timerTradePoll );
		g_timerTradePoll = null;
	}
	if ( g_bPollInFlight )
	{
		// tell the in-flight poll to ignore its results as they'll be stale
		g_bPeriodicPollCancelledInFlight = true;
	}
}

function QueueNextTradeStatusUpdateRequest()
{
	CancelTradeStatusPoll();
	g_timerTradePoll = window.setTimeout( GetTradeStatus, TRADE_UPDATE_INTEVRAL );
}

function ElementCount( obj )
{
	if ( !obj )
		return 0;
	else if ( obj instanceof Array )
		return obj.length;
	else
		return Object.keys( obj ).length;
}

function RefreshTradeStatus( rgTradeStatus, bForce )
{
	if ( rgTradeStatus.newversion || bForce )
	{
		var rgTradeStatusForSlots = rgTradeStatus;
		if ( bForce && !rgTradeStatus.newversion )
		{
			// if we are forcing an update (such ass after loading partner's inventory),
			//	 use the last full update for putting items in the slots
			rgTradeStatusForSlots = g_rgLastFullTradeStatus;
		}

		UpdateSlots( rgTradeStatusForSlots.me.assets, rgTradeStatusForSlots.me.currency, true, UserYou, rgTradeStatusForSlots.version );

		UpdateSlots( rgTradeStatusForSlots.them.assets, rgTradeStatusForSlots.them.currency, false, UserThem, rgTradeStatusForSlots.version );

		iLastRefreshVersion = rgTradeStatus.version;
		if ( rgTradeStatus.newversion )
			g_rgLastFullTradeStatus = rgTradeStatus;

		var cMyItems = ElementCount( rgTradeStatusForSlots.me.assets );
		var cTheirItems = ElementCount( rgTradeStatusForSlots.them.assets );
		g_cItemsInTrade = cMyItems + cTheirItems;
		g_cCurrenciesInTrade = rgTradeStatusForSlots.me.currency.length + rgTradeStatusForSlots.them.currency.length;
		if ( cMyItems > 0 )
			Tutorial.OnUserAddedItemsToTrade();
	}
	if ( rgTradeStatus.me.ready && !UserYou.bReady || !rgTradeStatus.me.ready && UserYou.bReady )
	{
		UserYou.bReady = rgTradeStatus.me.ready;
		if ( !UserYou.bReady ) // you were unreadied by a trade change
			$('notready_tradechanged_message').show();
	}
	if ( rgTradeStatus.them.ready && !UserThem.bReady || !rgTradeStatus.them.ready && UserThem.bReady )
	{
		UserThem.bReady = rgTradeStatus.them.ready;
	}
	if ( rgTradeStatus.them.connection_pending || ( rgTradeStatus.them.sec_since_touch && rgTradeStatus.them.sec_since_touch > MESSAGE_TRADE_PARTNER_ABSENSE_TIME ) )
	{
		$('trade_theirs_timeout').show();
	}
	else
	{
		$('trade_theirs_timeout').hide();
	}

	g_bConfirmPending = rgTradeStatus.me.confirmed;

	UpdateReadyButtons();

	// only update the event log if we have all the data about the other user's inventory
	if ( rgTradeStatus.events && !UserThem.BIsLoadingInventoryData() && !UserYou.BIsLoadingInventoryData() )
	{
		UpdateEventLog( rgTradeStatus.events );
	}

}

function UpdateSlots( rgSlotItems, rgCurrency, bYourSlots, user, version )
{
	var slotPrefix = bYourSlots ? 'your_slot_' : 'their_slot_';
	var elSlotContainer = bYourSlots ? $('your_slots') : $('their_slots');
	var elCurrencySlotContainer = bYourSlots ? $('your_slots_currency') : $('their_slots_currency');

	// see what the last slot with an item is
	var cMaxSlotId = 0;
	if ( rgSlotItems instanceof Array )
	{
		cMaxSlotId = rgSlotItems.length;
	}
	else
	{
		for ( var slotid in rgSlotItems )
		{
			var iSlot = parseInt( slotid );
			if ( iSlot && !isNaN( iSlot ) )
				cMaxSlotId = Math.max( iSlot, cMaxSlotId );
		}
		cMaxSlotId++;
	}

	var cCurrenciesInTrade = 0;
	for ( var iCurrency = 0; iCurrency < rgCurrency.length; iCurrency++ )
	{
		var currencyUpdate = rgCurrency[iCurrency];

		// just skip pending inventories, the currency will be drawn after the inventory arrival
		var inventory = user.getInventory( currencyUpdate.appid, currencyUpdate.contextid );
		if ( !inventory || inventory.BIsPendingInventory() )
			continue;

		cCurrenciesInTrade++;

		var currency = user.FindCurrency( currencyUpdate.appid, currencyUpdate.contextid, currencyUpdate.currencyid );
		var stack = GetTradeItemStack( user, currency );

		if ( ( parseInt( stack.amount ) + parseInt( stack.fee ) ) != currencyUpdate.amount )
		{
			UpdateTradeItemStackDisplay( currency, stack, currencyUpdate.amount );
			if ( !bYourSlots )
				HighlightNewlyAddedItem( stack.element );
		}

		stack.version = version;
	}
	var rgCurrencySlots = elCurrencySlotContainer.childElements();
	if ( cCurrenciesInTrade < rgCurrencySlots.length )
	{
		// there's an extra slot in the trade, remove it
		for ( var iCurrencySlot = 0; iCurrencySlot < rgCurrencySlots.length; iCurrencySlot++ )
		{
			var elSlot = rgCurrencySlots[iCurrencySlot];
			var stack = elSlot.stack;
			if ( stack.version < version )
			{
				elSlot.remove();
				var origCurrency = user.FindCurrency( stack.appid, stack.contextid, stack.id );
				origCurrency.amount = origCurrency.original_amount;
				origCurrency.trade_stack = null;
				if ( bYourSlots )
					UpdateCurrencyDisplay( origCurrency );
			}
		}
	}

	EnsureSufficientTradeSlots( bYourSlots, cMaxSlotId, cCurrenciesInTrade );

	var nNumBadItems = 0;
	var firstBadItem = null;
	var nFullInventoryAppId = false;
	for ( var slot = 0; slot < elSlotContainer.childElements().length; slot++ )
	{
		var elSlot = $( slotPrefix + slot );
		var elCurItem = elSlot.down('.slot_inner').firstDescendant();
		var elNewItem = null;

		var bRemoveCurItem = ( elCurItem != null );

		var bItemIsNewToTrade = false;  //lets us know if we need to indicate this item was added
		var bStackAmountChanged = false;	// if a stackable item's amount has changed, we also treat that like new

		if ( rgSlotItems[slot] )
		{
			var appid = rgSlotItems[slot].appid;
			var contextid = rgSlotItems[slot].contextid;
			var itemid = rgSlotItems[slot].assetid;
			var amount = rgSlotItems[slot].amount;

			// check that we are allowed to receive this item
			if ( !bYourSlots )
			{
				if ( !UserYou.BAllowedToRecieveItems( appid, contextid ) )
				{
					if ( !nFullInventoryAppId && UserYou.BInventoryIsFull( appid, contextid ) )
					{
						nFullInventoryAppId = appid;
					}

					if ( nNumBadItems == 0 )
					{
						firstBadItem = rgSlotItems[slot];
					}

					nNumBadItems++;
				}
			}

			if ( elCurItem && elCurItem.rgItem && elCurItem.rgItem.appid == appid && elCurItem.rgItem.contextid == contextid
					&& elCurItem.rgItem.id == itemid && !elCurItem.rgItem.unknown )
			{
				// it's already there
				bRemoveCurItem = false;

				if ( elCurItem.rgItem.is_stackable )
				{
					var stack = elCurItem.rgItem;
					bStackAmountChanged = ( amount != stack.amount );
					UpdateTradeItemStackDisplay( stack.parent_item, stack, amount );
				}
			}
			else
			{
				// it's new to the trade
				elNewItem = user.findAssetElement( appid, contextid, itemid );
				var item = elNewItem.rgItem;

				if ( !item.unknown )
				{
					bItemIsNewToTrade = true;
				}

				if ( item.is_stackable )
				{
					var stack = GetTradeItemStack( user, item );
					bStackAmountChanged = ( amount != stack.amount );
					UpdateTradeItemStackDisplay( item, stack, amount );

					elNewItem = stack.element;
				}

				if ( elNewItem && elNewItem.parentNode )
				{
					if ( BIsInTradeSlot( elNewItem ) )
					{
						CleanupSlot( elNewItem.parentNode.parentNode );
						bItemIsNewToTrade = false;
					}
					elNewItem.remove();
				}
			}
		}

		if ( elCurItem && bRemoveCurItem )
		{
			if ( elCurItem.rgItem && elCurItem.rgItem.is_stackable )
			{
				var stack = elCurItem.rgItem;
				UpdateTradeItemStackDisplay( stack.parent_item, stack, 0 );
				elCurItem.remove();
			}
			else if ( elCurItem.rgItem && elCurItem.rgItem.homeElement )
				elCurItem.rgItem.homeElement.appendChild( elCurItem.remove() );
			else
				elCurItem.remove();
			CleanupSlot( elSlot );
		}

		if ( elNewItem )
		{
			PutItemInSlot( elNewItem, elSlot );
			if ( bItemIsNewToTrade && !bYourSlots )
			{
				HighlightNewlyAddedItem( elNewItem );
			}
		}
		else if ( bStackAmountChanged && !bYourSlots )
		{
			HighlightNewlyAddedItem( elCurItem );
		}
	}

	if ( !bYourSlots && nNumBadItems != g_nItemsFromContextWithNoPermissionToReceive && !UserThem.BIsLoadingInventoryData() )
	{
		g_nItemsFromContextWithNoPermissionToReceive = nNumBadItems;

		if ( nNumBadItems > 0 )
		{
			var strEvent = "";
			var item = user.findAsset( firstBadItem.appid, firstBadItem.contextid, firstBadItem.assetid );
			if ( item )
			{
				if ( nNumBadItems == 1 )
				{
					strEvent = 'You are not allowed to receive the item "%1$s."'
							.replace( '%1$s', item.name );
				}
				else
				{
					strEvent = 'You are not allowed to receive %1$s of the items being offered including "%2$s."'
							.replace( '%1$s', nNumBadItems )
							.replace( '%2$s', item.name );
				}
			}
			else
			{
				if ( nNumBadItems == 1 )
				{
					strEvent = 'You are not allowed to receive one of the items being offered.';
				}
				else
				{
					strEvent = 'You are not allowed to receive %1$s of the items being offered.'
							.replace( '%1$s', nNumBadItems );
				}
			}

			if ( nFullInventoryAppId )
			{
				var rgAppData = g_rgAppContextData[nFullInventoryAppId];
				var strEventAppend = 'Your inventory for %1$s is full.'
						.replace( '%1$s', rgAppData.name );

				strEvent = strEvent + ' ' + strEventAppend;
			}

			var elEvent = new Element( 'div', {'class': 'logevent' } );
			elEvent.update( strEvent );
			$('log').appendChild( elEvent );
		}
	}
}

// default border color: #3A3A3A
function HighlightNewlyAddedItem( elItem )
{

	var rgItem = elItem.rgItem;
	var slotParent = elItem.parentNode;

	slotParent.style.backgroundColor = '#ffffff';
	elItem.hide();
	new Effect.Appear( elItem, {duration: 0.6, afterFinish: function() { slotParent.style.backgroundColor = ''; } } );

}

/*
 *		Trade events log
 */

var EventLogAddYouTemplate = new Template( 'You added <span class="item" style="#{itemstyle}">#{itemname}</span>');
var EventLogAddThemTemplate = new Template( '#{theirname} added <span class="item" style="#{itemstyle}">#{itemname}</span>');
var EventLogRemoveYouTemplate = new Template( 'You removed <span class="item" style="#{itemstyle}">#{itemname}</span>');
var EventLogRemoveThemTemplate = new Template( '#{theirname} removed <span class="item" style="#{itemstyle}">#{itemname}</span>');
var EventLogReadyYouTemplate = new Template( 'You are ready' );
var EventLogReadyThemTemplate = new Template( '#{theirname} is ready');
var EventLogUnReadyYouTemplate = new Template( 'You are not ready' );
var EventLogUnReadyThemTemplate = new Template( '#{theirname} is not ready');
var EventLogIncreaseCurrencyYouTemplate = new Template( 'You increased the amount of <span class="item" style="#{itemstyle}">#{currencyname}</span> to <span style="#{itemstyle}">#{amount}</span>');
var EventLogDecreaseCurrencyYouTemplate = new Template( 'You decreased the amount of <span class="item" style="#{itemstyle}">#{currencyname}</span> to <span style="#{itemstyle}">#{amount}</span>');
var EventLogIncreaseCurrencyThemTemplate = new Template( '#{theirname} increased the amount of <span class="item" style="#{itemstyle}">#{currencyname}</span> to <span style="#{itemstyle}">#{amount}</span>');
var EventLogDecreaseCurrencyThemTemplate = new Template( '#{theirname} decreased the amount of <span class="item" style="#{itemstyle}">#{currencyname}</span> to <span style="#{itemstyle}">#{amount}</span>');

function UpdateEventLog( events )
{
	var iLastLog = g_iNextLogPos - 1;
	var bDidAppend = false;
	var bNeedInventoryLoad = false;
	for ( var i in events )
	{
		if ( i < g_iNextLogPos )
			continue;
		var event = events[i];

		var bTheirAction = ( event.steamid && event.steamid == g_ulTradePartnerSteamID );
		var elEvent = new Element( 'div', {'class': 'logevent' } );
		var strEvent = null;
		var strAfterEvent = null;
		switch ( parseInt( event.action ) )
		{
		case 0:
		case 1:
			var template = null;
			if ( event.action == 0 )
				template = bTheirAction ? EventLogAddThemTemplate : EventLogAddYouTemplate;
			else
				template = bTheirAction ? EventLogRemoveThemTemplate : EventLogRemoveYouTemplate;

			var user = bTheirAction ? UserThem : UserYou;
			var item = user.findAsset( event.appid, event.contextid, event.assetid );
			if ( !item && user.BIsLoadingInventoryData() )
			{
				bNeedInventoryLoad = true;
				break;
			}

			var itemname = ( item ) ? item.name : 'Unknown Item';
			var itemstyle = ( item && item.name_color ) ? 'color: #' + item.name_color + ';' : '';

			strEvent = template.evaluate( { theirname: g_strTradePartnerPersonaName, itemname: itemname, itemstyle: itemstyle } );

			break;
		case 2:
		case 3:
			var template = null;
			if ( event.action == 2 )
				template = bTheirAction ? EventLogReadyThemTemplate : EventLogReadyYouTemplate;
			else
				template = bTheirAction ? EventLogUnReadyThemTemplate : EventLogUnReadyYouTemplate;

			strEvent = template.evaluate( { theirname: g_strTradePartnerPersonaName } );

			break;
		case 6:
			var template = null;
			var bAmountChanged = false;
			var newAmount = parseInt( event.amount );
			var oldAmount = parseInt( event.old_amount );

			if ( event.amount == 0 )
			{
				template = bTheirAction ? EventLogRemoveThemTemplate : EventLogRemoveYouTemplate;
			}
			else if ( event.old_amount == 0 )
			{
				template = bTheirAction ? EventLogAddThemTemplate : EventLogAddYouTemplate;
			}
			else if ( newAmount > oldAmount )
			{
				bAmountChanged = true;
				template = bTheirAction ? EventLogIncreaseCurrencyThemTemplate : EventLogIncreaseCurrencyYouTemplate;
			}
			else if ( newAmount < oldAmount )
			{
				bAmountChanged = true;
				template = bTheirAction ? EventLogDecreaseCurrencyThemTemplate : EventLogDecreaseCurrencyYouTemplate;
			}

			var user = bTheirAction ? UserThem : UserYou;
			var currency = user.FindCurrency( event.appid, event.contextid, event.currencyid );
			if ( !currency && user.BIsLoadingInventoryData() )
			{
				bNeedInventoryLoad = true;
				break;
			}

			var currencyname = ( currency ) ? currency.name : 'Unknown Item';

			var formatFunc;
			if ( CurrencyIsWalletFunds( currency ) )
			{
				if ( bTheirAction )
				{
					var bShouldConvert = typeof(g_rgWalletInfo) != 'undefined' &&
						g_rgWalletInfo['wallet_currency'] != g_rgWalletInfo['wallet_other_currency'];
					var feeInfo = CalculateFeeAmount( newAmount );
					var nNewAmountAfterFee = newAmount - feeInfo.fees;
					if ( bShouldConvert )
					{
						nNewAmountAfterFee = ConvertToOurCurrencyForDisplay( nNewAmountAfterFee );
					}

					var bPreviouslyOverMax = g_bWalletBalanceWouldBeOverMax;
					g_bWalletBalanceWouldBeOverMax = newAmount > 0 && ( typeof(g_rgWalletInfo) != 'undefined' && nNewAmountAfterFee + g_rgWalletInfo['wallet_balance'] > g_rgWalletInfo['wallet_max_balance'] );

					if ( g_bWalletBalanceWouldBeOverMax )
					{
						strAfterEvent =
							'<%1$s>Error:<%2$s> You can\'t accept %3$s\'s offer of %4$s. You currently have %5$s in your Steam Wallet, but this offer would put you over the maximum of %6$s.'
								.replace( '%1$s', 'span class="warning"' )
								.replace( '%2$s', '/span' )
								.replace( '%3$s', g_strTradePartnerPersonaName )
								.replace( '%4$s', v_currencyformat( nNewAmountAfterFee, GetCurrencyCode( g_rgWalletInfo['wallet_currency'] ) ) )
								.replace( '%5$s', v_currencyformat( g_rgWalletInfo['wallet_balance'], GetCurrencyCode( g_rgWalletInfo['wallet_currency'] ) ) )
								.replace( '%6$s', v_currencyformat( g_rgWalletInfo['wallet_max_balance'], GetCurrencyCode( g_rgWalletInfo['wallet_currency'] ) ) );
					}

					if ( g_bWalletBalanceWouldBeOverMax != bPreviouslyOverMax )
					{
						UpdateReadyButtons();
					}
				}

				// Don't show a currency name unless we're changing value ( ex: "increased the amount of Wallet Funds to $1.23" )
				currencyname = bAmountChanged ? 'Wallet Funds' : '';

				formatFunc = function( x ) {
					var feeInfo = CalculateFeeAmount( x );
					var nPostFeeAmount = x - feeInfo.fees;
					if ( bShouldConvert )
					{
						// return "OurCurrency / TheirCurrency";
						if ( g_rgWalletInfo['wallet_other_currency'] == ( currency.id % 1000 ) )
						{
							return v_currencyformat( ConvertToOurCurrencyForDisplay( nPostFeeAmount ), GetCurrencyCode( g_rgWalletInfo['wallet_currency'] ) ) + ' / ' + v_currencyformat( nPostFeeAmount, currency.name );
						}
						else if ( g_rgWalletInfo['wallet_currency'] == ( currency.id % 1000 ) )
						{
							return v_currencyformat( nPostFeeAmount, currency.name ) + ' / ' + v_currencyformat( ConvertToTheirCurrency( nPostFeeAmount ), GetCurrencyCode( g_rgWalletInfo['wallet_other_currency'] ) );
						}
					}

					return v_currencyformat( nPostFeeAmount, currency.name );
				};
			}
			else
			{
				formatFunc = v_numberformat;
			}

			var itemname = formatFunc( event.amount == 0 ? event.old_amount : event.amount ) + ' ' + currencyname;
			var itemstyle = ( currency && currency.name_color ) ? 'color: #' + currency.name_color + ';' : '';

			strEvent = template.evaluate(
					{
						theirname: g_strTradePartnerPersonaName,
						itemname: itemname,
						currencyname: currencyname,
						itemstyle: itemstyle,
						amount: formatFunc( event.amount )
					}
			);

			break;
		case 7:
			if ( bTheirAction )
				strEvent = '<span class="playerchatname">' + g_strTradePartnerPersonaName + '</span>: ';
			else
				strEvent = '<span class="playerchatname">' + g_strYourPersonaName + '</span>: ';

			strEvent += event.text ? event.text.escapeHTML().replace( /\n/g, '<br>' ) : '';

			break;
		case 4:
		case 5:
		default:
			continue;
		}
		// we need to wait for some items to load, so abort!
		if ( bNeedInventoryLoad )
			break;

		if ( strEvent )
		{
			strEvent += ' <span class="timestamp">' + ( new Date(event.timestamp * 1000).toLocaleTimeString() ) + '</span>';
			elEvent.update( strEvent );
			$('log').appendChild( elEvent );
			bDidAppend = true;
		}

		if ( strAfterEvent )
		{
			var elAfterEvent = new Element( 'div', {'class': 'logevent' } );
			elAfterEvent.update( strAfterEvent );
			$('log').appendChild( elAfterEvent );
			bDidAppend = true;
		}

		iLastLog = Math.max( iLastLog, i );
	}
	if ( bDidAppend )
	{
		$('log').scrollTop = 10000;
	}
	g_iNextLogPos = iLastLog + 1;
}

/*
 *		Ready/Confirm
 */

var g_bConfirmPending = false;

function ToggleReady( bReady )
{
	UserYou.bReady = bReady;
	CancelTradeStatusPoll();
	new Ajax.Request( 'http://steamcommunity.com/trade/' + g_ulTradePartnerSteamID + '/toggleready/', {
		method: 'post',
		parameters: {
			sessionid: g_sessionID,
			ready: bReady,
			version: g_rgCurrentTradeStatus.version
		},
		onSuccess: OnTradeStatusUpdate,
		onFailure: RequestTradeStatusUpdate
	} );

	UpdateReadyButtons();
	$('notready_tradechanged_message').hide();
}

var g_bConfirmInFlight = false;
function ConfirmTrade()
{
	if ( g_bConfirmInFlight )
		return;
	if ( UserYou.bReady && UserThem.bReady )
	{
		CancelTradeStatusPoll();
		g_bConfirmInFlight = true;
		new Ajax.Request( 'http://steamcommunity.com/trade/' + g_ulTradePartnerSteamID + '/confirm/', {
			method: 'post',
			parameters: {
				sessionid: g_sessionID,
				version: g_rgCurrentTradeStatus.version
			},
			onSuccess: OnTradeStatusUpdate,
			onFailure: RequestTradeStatusUpdate,
			onComplete: function() { g_bConfirmInFlight = false; }
		});
	}
}

function UpdateReadyButtons()
{
	if ( UserYou.bReady )
	{
		$('you_cantready').hide();
		$('you_notready').hide();
		$('you_ready').show();
		$('trade_area').addClassName('ready');
		$('trade_yours').addClassName('ready');
		$('inventory_box').addClassName('ready');
		Tutorial.OnUserIsReady();
	}
	else
	{
		var badOffer = g_bWalletBalanceWouldBeOverMax || g_nItemsFromContextWithNoPermissionToReceive > 0;
		if ( !badOffer && ( g_cItemsInTrade > 0 || g_cCurrenciesInTrade > 0 ) )
		{
			$('you_cantready').hide();
			$('you_notready').show();
		}
		else
		{
			var strMessage;
			if ( badOffer )
			{
				strMessage = 'You can\'t accept the offer. See chat.';
			}
			else
			{
				strMessage = 'Waiting for someone to make an offer.';
			}

			$$('#you_cantready .content').each( function( elContent ) {
				elContent.update( strMessage );
			});

			$('you_notready').hide();
			$('you_cantready').show();
		}
		$('you_ready').hide();
		$('trade_area').removeClassName('ready');
		$('trade_yours').removeClassName('ready');
		$('inventory_box').removeClassName('ready');
	}

	if ( UserThem.bReady )
	{
		$('them_notready').hide();
		$('them_ready').show();
		$('trade_theirs').addClassName('ready');
	}
	else
	{
		$('them_notready').show();
		$('them_ready').hide();
		$('trade_theirs').removeClassName('ready');
	}

	if ( !UserYou.bReady || !UserThem.bReady )
	{
		g_bConfirmPending = false;
	}

	if ( g_bConfirmPending )
	{
		$('trade_confirm_message').update( 'Waiting for the other party to confirm...' );
		$('trade_confirmbtn').hide();
		$('trade_confirm_throbber').show();
	}
	else
	{
		$('trade_confirmbtn').show();
		$('trade_confirm_throbber').hide();
		if ( UserYou.bReady && UserThem.bReady )
		{
			$('trade_confirmbtn').addClassName( 'active' );
			$('trade_confirm_message').update( 'Both parties are ready.' );
		}
		else
		{
			$('trade_confirmbtn').removeClassName( 'active' );
			$('trade_confirm_message').update( 'Waiting for both parties to check the ready box.' );
		}
	}
}

var g_bRequestedCancel = false;
var g_bTradeCancelled = false;
function CancelTrade()
{
	if ( g_bTradeCancelled )
		return;

	g_bTradeCancelled = true;
	g_bRequestedCancel = true;
	new Ajax.Request( 'http://steamcommunity.com/trade/' + g_ulTradePartnerSteamID + '/cancel/', {
		method: 'post',
		parameters: {
			sessionid: g_sessionID
		},
		onComplete: function() { g_bTradeCancelled = false; RequestTradeStatusUpdate(); }
	});
}


/* currency transfer in/out of trade */
function PresentCurrencyDialog( currency )
{
	if ( CurrencyIsWalletFunds( currency ) && g_rgWalletInfo['wallet_currency'] != g_rgWalletInfo['wallet_other_currency'] )
	{
		CurrencyConversionDialog.Show( currency );
	}
	else
	{
		CurrencyDialog.Show( currency );
	}
}

function UpdateCurrencyDisplay( currency )
{
	// no display element
	if ( !currency.element )
		return;

	var elAmount = currency.element.down('.item_currency_amount');
	if ( elAmount )
	{
		if ( CurrencyIsWalletFunds( currency ) )
		{
			var bShouldConvert = typeof(g_rgWalletInfo) != 'undefined' &&
					g_rgWalletInfo['wallet_currency'] != g_rgWalletInfo['wallet_other_currency'] &&
					g_rgWalletInfo['wallet_currency'] != ( currency.id % 1000 );
			
			var strAmount = ( currency.owner != UserYou && bShouldConvert ?
					v_currencyformat( ConvertToOurCurrencyForDisplay( currency.amount ), GetCurrencyCode( g_rgWalletInfo['wallet_currency'] ) ) :
					v_currencyformat( currency.amount, currency.name ) );

			// Display the fee in small text underneath if applicable
			if ( currency.fee > 0 && currency.owner == UserYou )
			{
				strAmount += "<div style=\"font-size: xx-small\">" + v_currencyformat( currency.fee, currency.name ) + "</div>";
			}
			elAmount.update( strAmount );
		}
		else
		{
			elAmount.update( v_numberformat( currency.amount ) );
		}
	}
}


CurrencyDialog = {

	m_bInitialized: false,
	m_currency: null,
	m_fnDocumentKeyHandler: null,
	m_slider: null,
	m_elSliderHandle: null,
	m_elSliderProgress: null,
	m_elSliderCount: null,
	m_bIgnoreSlider: false,
	m_bIsWallet: false,

	Initialize: function() {
		$('trade_currency_dialog_accept').observe( 'click', this.OnAccept.bindAsEventListener(this) );
		$('trade_currency_dialog_cancel').observe( 'click', this.OnCancel.bindAsEventListener(this) );
		$('trade_currency_input').observe( 'keypress', this.OnInputKeyPress.bindAsEventListener(this) );
		$('trade_currency_input').observe( 'keyup', this.OnInputKeyUp.bindAsEventListener(this) );

		$('trade_currency_dialog').style.visibility = 'hidden';
		$('trade_currency_dialog').show();

		this.m_elSliderHandle = $('trade_currency_slider').down('.handle');
		this.m_slider = new Control.Slider( this.m_elSliderHandle, $('trade_currency_slider'), {
			range: $R(0, 1 ),
			sliderValue: 0,
			onSlide: this.OnSliderSlide.bind( this ),
			onChange: this.OnSliderChange.bind( this )
		});
		this.m_elSliderProgress = $('trade_currency_slider_ctn').down('.slider_progress');
		this.m_elSliderCount = $('trade_currency_slider_count');
		$('trade_currency_dialog').hide();
		$('trade_currency_dialog').style.visibility = '';
		this.m_bInitialized = true;
	},

	Show: function ( currency ) {

		if ( !this.m_bInitialized )
			this.Initialize();

		this.m_currency = currency;
		this.m_bIsWallet = CurrencyIsWalletFunds( currency );
		var idAppend = ( this.m_bIsWallet ? '_wallet' : '' );

		var stack = currency.trade_stack;

		if ( this.m_bIsWallet )
			$('trade_currency_dialog').addClassName('trade_wallet');
		else
			$('trade_currency_dialog').removeClassName('trade_wallet');

		if ( !this.m_bIsWallet )
		{
			$('trade_currency_dialog_currencyname1').update( currency.name );
			$('trade_currency_dialog_currencyname2').update( currency.name );
		}

		var rgContext = UserYou.GetContext( currency.appid, currency.contextid );
		$('trade_currency_dialog_contextname').update( rgContext ? rgContext.name : '' );

		var amount = stack && stack.amount > 0 ? stack.amount : 1;

		$('trade_currency_input').value = amount;

		var iconUrl = ImageURL( currency.icon_url, 42, '42f' );
		$('trade_currency_dialog_symbol1').src = iconUrl;
		$('trade_currency_dialog_symbol2').src = iconUrl;

		$('trade_currency_input').style.color = currency.name_color ? '#' + currency.name_color : '';
		$('trade_currency_dialog_remaining_display').style.color = currency.name_color ? '#' + currency.name_color : '';

		$('trade_currency_dialog_error').update('');

		this.m_fnDocumentKeyHandler = this.OnDocumentKeyPress.bindAsEventListener( this );
		$(document).observe( 'keydown', this.m_fnDocumentKeyHandler );

		var maximum = this.m_currency.original_amount;
		if ( this.m_bIsWallet && g_rgWalletInfo['wallet_fee'] )
		{
			$('trade_currency_fee_amount_percent').update( ( g_rgWalletInfo['wallet_fee_percent'] * 100).toFixed(1) );
			var feeInfo = CalculateFeeAmount( maximum )
			maximum = maximum - feeInfo.fees;
		}

		this.m_slider.range = $R( 0, maximum );
		this.m_slider.maximum = this.m_currency.original_amount;
		this.m_slider.setValue( amount );

		this.UpdateRemainingCurrencyDisplay();

		showModal( 'trade_currency_dialog', true );
		$('trade_currency_input').focus();
	},

	UpdateRemainingCurrencyDisplay: function() {
		var inputValue = this.GetInputValueAsInt();
		var nAmount = inputValue;

		// If we're taking a fee, nAmount must be equal to the amount deducted from the sender's wallet.
		if ( this.m_bIsWallet && g_rgWalletInfo['wallet_fee'] )
		{
			if ( inputValue > 0 )
			{
				var feeInfo = CalculateAmountToSendForDesiredReceivedAmount( nAmount );
				$('trade_currency_fee_amount_dollars').update( v_currencyformat( feeInfo.fees, this.m_currency.name ) );
			}
			else
			{
				$('trade_currency_fee_amount_dollars').update( v_currencyformat( 0, this.m_currency.name ) );
			}
			
			$('trade_currency_fee_total_dollars').update( v_currencyformat( nAmount, this.m_currency.name ) );
		}

		var nDisplayAmount = this.m_currency.original_amount;
		if ( nAmount <= this.m_currency.original_amount )
			nDisplayAmount = this.m_currency.original_amount - nAmount;

		if ( this.m_bIsWallet )
		{
			$('trade_currency_dialog_remaining_display').update( v_currencyformat( nDisplayAmount, this.m_currency.name ) );
		}
		else
		{
			$('trade_currency_dialog_remaining_display').update( v_numberformat( nDisplayAmount ) );
		}
	},

	DisplayError: function( error ) {
		$('trade_currency_dialog_error').update( error );
		$('trade_currency_dialog_error').style.color = '#ffffff';
		new Effect.Morph( $('trade_currency_dialog_error'), { style: {color: '#ff0000'}, duration: 0.25 } );
	},

	Dismiss: function() {
		$(document).stopObserving( 'keydown', this.m_fnDocumentKeyHandler );
		hideModal( 'trade_currency_dialog' );
	},

	GetInputValueAsInt: function() {
		var nAmount;
		var strAmount = $('trade_currency_input').value;

		if ( !strAmount )
		{
			return 0;
		}

		if ( this.m_bIsWallet )
		{
			// strip the currency symbol, set commas to periods, set .-- to .00
			strAmount = strAmount.replace( GetCurrencySymbol( this.m_currency.name ), '' ).replace( ',', '.' ).replace( '.--', '.00');

			var flAmount = parseFloat( strAmount ) * 100;
			nAmount = Math.round( isNaN(flAmount) ? 0 : flAmount );
		}
		else
		{
			nAmount = parseInt( strAmount.replace( /[,.]/g, '' ) );
		}

		nAmount = Math.max( nAmount, 0 );
		return nAmount;
	},

	OnAccept: function( event ) {

		var inputValue = (this.m_bIsWallet ? $('trade_currency_input').value.replace( GetCurrencySymbol( this.m_currency.name ), '' ).replace( ',', '.' ).replace( '.--', '.00') : $('trade_currency_input').value );
		if ( ! inputValue.match( /^[0-9,.]*$/ ) )
		{
			this.DisplayError( 'Please enter a valid amount above.' );
			return;
		}

		var xferAmount = this.GetInputValueAsInt();

		if ( this.m_bIsWallet && xferAmount > 0 )
		{
			var feeInfo = CalculateAmountToSendForDesiredReceivedAmount( xferAmount );
			xferAmount = feeInfo.amount;
		}

		if ( xferAmount > this.m_currency.original_amount )
		{
			this.DisplayError( 'You do not have enough ' + this.m_currency.name + '.' );
			return;
		}

		SetStackableItemInTrade( this.m_currency, xferAmount );

		this.Dismiss();
		event.stop();
	},

	OnCancel: function( event ) {
		this.Dismiss();
		event.stop();
	},

	OnDocumentKeyPress: function( event ) {
		if ( event.keyCode == Event.KEY_ESC )
		{
			this.Dismiss();
			event.stop();
		}
	},

	OnInputKeyPress: function( event ) {
		if ( event.keyCode == Event.KEY_RETURN )
		{
			this.OnAccept( event );
		}
	},

	OnInputKeyUp: function( event ) {

		var value = this.GetInputValueAsInt();

		this.UpdateRemainingCurrencyDisplay();

		this.m_bIgnoreSlider = true;
		this.m_slider.setValue( value );
		this.m_bIgnoreSlider = false;
		this.UpdateSliderNumberDisplays( value );
	},

	UpdateSliderNumberDisplays: function( value )
	{
		var flooredValue = Math.floor( value );
		var strValue = ( this.m_bIsWallet ? v_currencyformat( flooredValue, this.m_currency.name ) : v_numberformat( flooredValue ) );

		this.m_elSliderProgress.style.width = this.m_slider.handles[0].style.left;

		this.m_elSliderCount.style.left = ( parseInt( this.m_slider.handles[0].style.left ) - 40 ) + 'px';
		this.m_elSliderCount.update( strValue );
	},

	SetInputValuesFromSlider: function( value )
	{
		var flooredValue = Math.floor( value );
		var strValue = ( this.m_bIsWallet ? v_currencyformat( flooredValue, this.m_currency.name ) : v_numberformat( flooredValue ) );
		$('trade_currency_input').value = strValue;
		this.UpdateRemainingCurrencyDisplay();
	},

	OnSliderSlide: function( value )
	{
		this.UpdateSliderNumberDisplays( value );
		if ( this.m_slider.active && !this.m_elSliderHandle.active )
		{
			this.m_elSliderHandle.active = true;
			this.m_elSliderHandle.addClassName('active');
		}

		if ( this.m_bIgnoreSlider )
			return;

		this.SetInputValuesFromSlider( value );
	},

	OnSliderChange: function( value )
	{
		if ( this.m_elSliderHandle.active )
		{
			this.m_elSliderHandle.active = false;
			this.m_elSliderHandle.removeClassName('active');
		}

		if ( this.m_bIgnoreSlider )
			return;
		this.m_bIgnoreSlider = true;

		this.UpdateSliderNumberDisplays( value );
		this.m_slider.setValue( value );

		this.SetInputValuesFromSlider( value );

		this.m_bIgnoreSlider = false;
	}
};

WarningDialog = {
	
	m_bInitialized: false,
	m_fnDocumentKeyHandler: null,

	Initialize: function() {
		$('trade_currency_dialog_warning_accept').observe( 'click', this.OnAccept.bindAsEventListener(this) );

		this.m_bInitialized = true;
	},

	Show: function ( strWarning ) {

		if ( !this.m_bInitialized )
			this.Initialize();

		this.m_fnDocumentKeyHandler = this.OnDocumentKeyPress.bindAsEventListener( this );
		$(document).observe( 'keydown', this.m_fnDocumentKeyHandler );

		$('trade_currency_dialog_warning_contents').update( strWarning );
		showModal( 'trade_currency_dialog_warning', true );
	},

	Dismiss: function() {
		$(document).stopObserving( 'keydown', this.m_fnDocumentKeyHandler );
		hideModal( 'trade_currency_dialog_warning' );
	},

	OnAccept: function( event ) {
		
		this.Dismiss();
		event.stop();
	},

	OnDocumentKeyPress: function( event ) {
		if ( event.keyCode == Event.KEY_ESC || event.keyCode == Event.KEY_RETURN )
		{
			this.OnAccept();
		}
	}
};

CurrencyConversionDialog = {

	m_bInitialized: false,
	m_currency: null,
	m_fnDocumentKeyHandler: null,
	m_slider: null,
	m_elSliderHandle: null,
	m_elSliderProgress: null,
	m_elSliderCount: null,
	m_bIgnoreSlider: false,
	m_bIgnoreConversion: false,
	m_bIsWallet: false,

	Initialize: function() {
		$('trade_currency_dialog_conversion_accept').observe( 'click', this.OnAccept.bindAsEventListener(this) );
		$('trade_currency_dialog_conversion_cancel').observe( 'click', this.OnCancel.bindAsEventListener(this) );
		$('trade_currency_conversion_input_you').observe( 'keypress', this.OnInputKeyPress.bindAsEventListener(this) );
		$('trade_currency_conversion_input_you').observe( 'keyup', this.OnInputKeyUp.bindAsEventListener(this) );
		$('trade_currency_conversion_input_them').observe( 'keypress', this.OnInputKeyPress.bindAsEventListener(this) );
		$('trade_currency_conversion_input_them').observe( 'keyup', this.OnOtherCurrencyInputKeyUp.bindAsEventListener(this) );

		$('trade_currency_dialog_conversion').style.visibility = 'hidden';
		$('trade_currency_dialog_conversion').show();

		this.m_elSliderHandle = $('trade_currency_conversion_slider').down('.handle');
		this.m_slider = new Control.Slider( this.m_elSliderHandle, $('trade_currency_conversion_slider'), {
			range: $R(0, 1 ),
			sliderValue: 0,
			onSlide: this.OnSliderSlide.bind( this ),
			onChange: this.OnSliderChange.bind( this )
		});
		this.m_elSliderProgress = $('trade_currency_conversion_slider_ctn').down('.slider_progress');
		this.m_elSliderCount = $('trade_currency_conversion_slider_count');
		$('trade_currency_dialog_conversion').hide();
		$('trade_currency_dialog_conversion').style.visibility = '';
		this.m_bInitialized = true;
	},

	Show: function ( currency ) {

		if ( !this.m_bInitialized )
			this.Initialize();

		this.m_currency = currency;

		var stack = currency.trade_stack;
		var amount = stack && stack.amount > 0 ? stack.amount : 1;

		$('trade_currency_conversion_input_you').value = amount;

		$('trade_currency_conversion_input_you').style.color = currency.name_color ? '#' + currency.name_color : '';
		$('trade_currency_conversion_input_them').style.color = currency.name_color ? '#' + currency.name_color : '';
		$('trade_currency_dialog_conversion_remaining').style.color = currency.name_color ? '#' + currency.name_color : '';
		$('trade_currency_dialog_conversion_currencyname1').style.color = currency.name_color ? '#' + currency.name_color : '';
		$('trade_currency_dialog_conversion_currencyname2').style.color = currency.name_color ? '#' + currency.name_color : '';
		
		$('trade_currency_dialog_conversion_currencyname1').update( currency.name );
		$('trade_currency_dialog_conversion_username1').update( g_strTradePartnerPersonaName );
		$('trade_currency_dialog_conversion_currencyname2').update( GetCurrencyCode( g_rgWalletInfo['wallet_other_currency'] ) );
		$('trade_currency_dialog_conversion_username2').update( g_strTradePartnerPersonaName );

		$('trade_currency_dialog_conversion_error').update('');

		this.m_fnDocumentKeyHandler = this.OnDocumentKeyPress.bindAsEventListener( this );
		$(document).observe( 'keydown', this.m_fnDocumentKeyHandler );

		var maximum = this.m_currency.original_amount;
		if ( g_rgWalletInfo['wallet_fee'] )
		{
			$('trade_currency_conversion_fee_amount_percent').update( ( g_rgWalletInfo['wallet_fee_percent'] * 100).toFixed(1) );
			var feeInfo = CalculateFeeAmount( maximum )
			maximum = maximum - feeInfo.fees;
		}

		this.m_slider.range = $R( 0, maximum );
		this.m_slider.maximum = this.m_currency.original_amount;
		this.m_slider.setValue( amount );

		this.UpdateRemainingCurrencyDisplay();

		showModal( 'trade_currency_dialog_conversion', true );
		$('trade_currency_conversion_input_you').focus();
	},

	UpdateRemainingCurrencyDisplay: function() {
		var inputValue = this.GetInputValueAsInt();
		var nAmount = inputValue;

		// If we're taking a fee, nAmount must be equal to the amount deducted from the sender's wallet.
		if ( g_rgWalletInfo['wallet_fee'] )
		{
			if ( inputValue > 0 )
			{
				var feeInfo = CalculateAmountToSendForDesiredReceivedAmount( nAmount );
				$('trade_currency_conversion_fee_amount_dollars').update( v_currencyformat( feeInfo.fees, this.m_currency.name ) );
			}
			else
			{
				$('trade_currency_conversion_fee_amount_dollars').update( v_currencyformat( 0, this.m_currency.name ) );
			}

			$('trade_currency_conversion_fee_total_dollars').update( v_currencyformat( nAmount, this.m_currency.name ) );
		}

		var nDisplayAmount = this.m_currency.original_amount;
		if ( nAmount <= this.m_currency.original_amount )
			nDisplayAmount = this.m_currency.original_amount - nAmount;

		$('trade_currency_dialog_conversion_remaining_display').update( v_currencyformat( nDisplayAmount, this.m_currency.name ) );
	},

	DisplayError: function( error ) {
		$('trade_currency_dialog_conversion_error').update( error );
		$('trade_currency_dialog_conversion_error').style.color = '#ffffff';
		new Effect.Morph( $('trade_currency_dialog_conversion_error'), { style: {color: '#ff0000'}, duration: 0.25 } );
	},

	Dismiss: function() {
		$(document).stopObserving( 'keydown', this.m_fnDocumentKeyHandler );
		hideModal( 'trade_currency_dialog_conversion' );
	},

	GetInputValueAsInt: function() {
		var nAmount;
		var strAmount = $('trade_currency_conversion_input_you').value;

		if ( !strAmount )
		{
			return 0;
		}

		// strip the currency symbol, set commas to periods, set .-- to .00
		strAmount = strAmount.replace( GetCurrencySymbol( this.m_currency.name ), '' ).replace( ',', '.' ).replace( '.--', '.00');

		var flAmount = parseFloat( strAmount ) * 100;
		nAmount = Math.round( isNaN(flAmount) ? 0 : flAmount );

		nAmount = Math.max( nAmount, 0 );
		return nAmount;
	},

	OnAccept: function( event ) {

		var inputValue = $('trade_currency_conversion_input_you').value.replace( GetCurrencySymbol( this.m_currency.name ), '' ).replace( ',', '.' ).replace( '.--', '.00');
		var theirInputValue = $('trade_currency_conversion_input_them').value.replace( GetCurrencySymbol( GetCurrencyCode( g_rgWalletInfo['wallet_other_currency'] ) ), '' ).replace( ',', '.' ).replace( '.--', '.00');
		var theirInputValueAsFloat = parseFloat( theirInputValue ) * 100;
		var theirInputValueAsInt = Math.max( Math.round( isNaN(theirInputValueAsFloat) ? 0 : theirInputValueAsFloat ), 0 );
		if ( ! inputValue.match( /^[0-9,.]*$/ ) )
		{
			this.DisplayError( 'Please enter a valid amount above.' );
			return;
		}

		var strWarning, bHadWarning;
		var xferAmount = this.GetInputValueAsInt();
		if ( theirInputValue.match( /^[0-9,.]*$/ ) && ConvertToTheirCurrency( xferAmount ) != theirInputValueAsInt )
		{
			bHadWarning = true;
			strWarning = 'Due to currency conversion, you cannot send %1$s to %2$s. The amount being sent has been changed to %3$s and %4$s will receive %5$s.'
					.replace( '%1$s', v_currencyformat( theirInputValueAsInt, GetCurrencyCode( g_rgWalletInfo['wallet_other_currency'] ) ) )
					.replace( '%2$s', g_strTradePartnerPersonaName )
					.replace( '%3$s', v_currencyformat( xferAmount, this.m_currency.name ) )
					.replace( '%4$s', g_strTradePartnerPersonaName )
					.replace( '%5$s', v_currencyformat( ConvertToTheirCurrency( xferAmount ), GetCurrencyCode( g_rgWalletInfo['wallet_other_currency'] ) ) );
		}


		var feeInfo = CalculateAmountToSendForDesiredReceivedAmount( xferAmount );
		xferAmount = feeInfo.amount;

		if ( bHadWarning && g_rgWalletInfo['wallet_fee'] )
		{
			strWarning += ' After the transaction fee, you will be charged %1$s.'
					.replace( '%1$s', v_currencyformat( xferAmount, this.m_currency.name ) );
		}

		if ( xferAmount > this.m_currency.original_amount )
		{
			this.DisplayError( 'You do not have enough ' + this.m_currency.name + '.' );
			return;
		}

		SetStackableItemInTrade( this.m_currency, xferAmount );

		this.Dismiss();
		event.stop();

		if ( bHadWarning )
		{
			WarningDialog.Show( strWarning );
		}
	},

	OnCancel: function( event ) {
		this.Dismiss();
		event.stop();
	},

	OnDocumentKeyPress: function( event ) {
		if ( event.keyCode == Event.KEY_ESC )
		{
			this.Dismiss();
			event.stop();
		}
	},

	OnInputKeyPress: function( event ) {
		if ( event.keyCode == Event.KEY_RETURN )
		{
			this.OnAccept( event );
		}
	},

	OnInputKeyUp: function( event ) {

		var value = this.GetInputValueAsInt();

		this.UpdateRemainingCurrencyDisplay();

		this.m_bIgnoreSlider = true;
		this.m_slider.setValue( value );
		this.m_bIgnoreSlider = false;
		this.UpdateSliderNumberDisplays( value );
	},

	OnOtherCurrencyInputKeyUp: function( event ) {

		// Convert the other currency back to our currency.
		var strAmount = $('trade_currency_conversion_input_them').value;
		strAmount = strAmount.replace( GetCurrencySymbol( GetCurrencyCode( g_rgWalletInfo['wallet_other_currency'] ) ), '' ).replace( ',', '.' ).replace( '.--', '.00');

		var nAmount = ConvertToOurCurrency( Math.floor( parseFloat( strAmount ) * 100 ) );
		$('trade_currency_conversion_input_you').value = v_currencyformat( nAmount, this.m_currency.name );

		this.m_bIgnoreConversion = true;
		this.OnInputKeyUp( event );
		this.m_bIgnoreConversion = false;
	},

	UpdateSliderNumberDisplays: function( value )
	{
		var flooredValue = Math.floor( value );
		var strValue = v_currencyformat( flooredValue, this.m_currency.name );

		this.m_elSliderProgress.style.width = this.m_slider.handles[0].style.left;

		this.m_elSliderCount.style.left = ( parseInt( this.m_slider.handles[0].style.left ) - 40 ) + 'px';
		this.m_elSliderCount.update( strValue );

		if ( !this.m_bIgnoreConversion )
		{
			var nAmount = ConvertToTheirCurrency( flooredValue );
			$('trade_currency_conversion_input_them').value = v_currencyformat( nAmount, GetCurrencyCode( g_rgWalletInfo['wallet_other_currency'] ) );
		}
	},

	SetInputValuesFromSlider: function( value )
	{
		var flooredValue = Math.floor( value );
		var strValue = v_currencyformat( flooredValue, this.m_currency.name );
		$('trade_currency_conversion_input_you').value = strValue;
		this.UpdateRemainingCurrencyDisplay();
	},

	OnSliderSlide: function( value )
	{
		this.UpdateSliderNumberDisplays( value );
		if ( this.m_slider.active && !this.m_elSliderHandle.active )
		{
			this.m_elSliderHandle.active = true;
			this.m_elSliderHandle.addClassName('active');
		}

		if ( this.m_bIgnoreSlider )
			return;

		this.SetInputValuesFromSlider( value );
	},

	OnSliderChange: function( value )
	{
		if ( this.m_elSliderHandle.active )
		{
			this.m_elSliderHandle.active = false;
			this.m_elSliderHandle.removeClassName('active');
		}

		if ( this.m_bIgnoreSlider )
			return;
		this.m_bIgnoreSlider = true;

		this.UpdateSliderNumberDisplays( value );
		this.m_slider.setValue( value );

		this.SetInputValuesFromSlider( value );

		this.m_bIgnoreSlider = false;
	}
};

function GetTradeItemStack( user, item )
{
	var stack = item.trade_stack;
	if ( !stack )
	{

		// build a virtual currency element that will represent the currency in the trade
		stack = Object.clone( item );
		stack.amount = 0;
		stack.fee = 0;
		stack.parent_item = item;
		stack.owner = user;
		var Inventory = user.getInventory( item.appid, item.contextid );
		var elStack = Inventory.BuildItemElement( stack );

		if ( typeof( elStack.drag_image ) != 'undefined' )
		{
			if ( elStack.lazyload_image )
			{
				elStack.lazyload_image = elStack.drag_image;
				delete elStack.drag_image;
			}
			else
			{
				// The image may have already been created (trade partner inventory)
				var elImage = elStack.select('img');
				if ( elImage )
				{
					elStack.drag_reset_image = elImage[0].src;
					elImage[0].src = elStack.drag_image;
				}
			}
		}

		Inventory.LoadItemImage( elStack );

		elStack.id = 'tradestack_' + stack.id;
		stack.element = elStack;
		stack.homeElement = null;

		// for currency, we make a unique slot for this element right now
		if ( item.is_currency )
		{
			var elSlot = CreateCurrencyTradeSlot( user == UserYou, item );
			PutItemInSlot( elStack, elSlot );

			elSlot.stack = stack;
		}

		if ( user == UserYou )
		{
			MakeCurrencyDraggable( elStack );
			elStack.observe( 'click', OnCurrencyInTradeClick.bind( null, item ) );
		}

		item.trade_stack = stack;
	}
	return stack;
}

function UpdateTradeItemStackDisplay( item, stack, amount )
{
	if ( amount != parseInt( stack.amount ) + parseInt( stack.fee ) )
	{
		item.amount = item.original_amount - amount;
		stack.amount = amount;
		stack.fee = 0;
		if ( CurrencyIsWalletFunds( stack ) && g_rgWalletInfo['wallet_fee'] && stack.amount > 0 )
		{
			var feeInfo = CalculateFeeAmount( stack.amount );
			stack.fee = feeInfo.fees;
			if ( stack.fee > 0 && stack.owner == UserYou )
			{
				// Fake some descriptions so that we can display fee information.
				stack.descriptions = [
					{
						value: '+%1$s Steam transaction fee (%2$s%%)'
							.replace( '%1$s', v_currencyformat( stack.fee, stack.name ) )
							.replace( '%2$s', (g_rgWalletInfo['wallet_fee_percent'] * 100).toFixed(1) )
							.replace( '%%', '%' )
					},
					{
						value: '%1$s Total cost to you'
							.replace( '%1$s', v_currencyformat( stack.amount, stack.name ) )
					}
				];

				var elDescriptors = $('hover_item_descriptors');
				PopulateDescriptions( elDescriptors, item.descriptions );
			}

			stack.amount -= stack.fee;
		}

		UpdateCurrencyDisplay( item );
		UpdateCurrencyDisplay( stack );
	}
}

function OnCurrencyInTradeClick( currency )
{
	if ( !g_bInDrag )
	{
		PresentCurrencyDialog( currency );
	}
}

function OnChatKeypress( event )
{
	// try not to catch any browser shortcuts
	if ( event.shiftKey )
		return;

	var keynum = event.which || event.keyCode;

	if ( keynum == Event.KEY_RETURN )
	{
		DoChat();
		event.stop();
	}
}

function OnChatKeyup( event )
{
	var elChatText = $('chat_text_entry');

	UpdateSendChatBtnState();

}

function UpdateSendChatBtnState()
{
	var elChatText = $('chat_text_entry');
	if ( elChatText && elChatText.value && v_trim( elChatText.value ).length > 0 )
		$('chat_send_btn').addClassName( 'active' );
	else
		$('chat_send_btn').removeClassName( 'active' );
}

function OnChatUpdate()
{
	UpdateSendChatBtnState.defer();
}

function DoChat()
{
	var elChatText = $('chat_text_entry');
	if ( elChatText && elChatText.value && v_trim( elChatText.value ).length > 0 )
	{
		SendChatMsg( elChatText.value );
	}
	elChatText.value = '';
	UpdateSendChatBtnState();
}

function SendChatMsg( strMessage )
{
	// send chat message will respond with the latest trade status (which should include the new message in the chat log)
	CancelTradeStatusPoll();
	new Ajax.Request( 'http://steamcommunity.com/trade/' + g_ulTradePartnerSteamID + '/chat/', {
		method: 'post',
		parameters: {
			sessionid: g_sessionID,
			message: strMessage,
			logpos: g_iNextLogPos,
			version: g_rgCurrentTradeStatus.version
		},
		onSuccess: OnTradeStatusUpdate,
		onFailure: OnTradeStatusFailure
	});
}

/*
	item filtering
 */

function TransferFocusToChat( event )
{
	if ( event.keyCode == 116 )
	{
		StopWatchingForUnload();
		return;
	}

	if ( document.activeElement.tagName == "TEXTAREA" || ( document.activeElement.tagName == "INPUT" && document.activeElement.type == "text" ) )
		return;

	// try not to catch any browser shortcuts
	if ( event.altKey || event.ctrlKey || event.metaKey )
		return;
	
	var c=null;
	if ( event.charCode )
		c = event.charCode;
	else
		c = event.keyCode;
	if ( c >= 65 && c <= 90 || c >= 48 && c <= 57 || c >= 97 && c <= 122 )
	{
		// this doesn't work outside of chrome, firefox has lost the keystroke by the time the control
		//		gets focus
		$('chat_text_entry').focus();
	}
}

var Tutorial = {
	bActive: false,
	iStep: 0,
	MAX_STEPS: 4,

	Init: function() {
		this.bActive = true;
		this.iStep = 1;
		this.UpdateStepDisplay();
	},

	UpdateStepDisplay: function() {
		for ( var i = 1; i <= this.MAX_STEPS; i++ )
		{
			var elArrow = $('tutorial_arrow_step' + i );
			var elStep = $('trading_welcome_step' + i );
			if ( elArrow )
			{
				if ( this.bActive && i == this.iStep )
				{
					elArrow.show();
					$(elArrow.parentNode).addClassName('activeArrow');
				}
				else
				{
					elArrow.hide();
					$(elArrow.parentNode).removeClassName('activeArrow');
				}
			}

			if ( elStep )
			{
				if ( i == this.iStep )
					elStep.show();
				else
					elStep.hide();
			}
		}
	},

	AdvanceToStep: function( step ) {
		if ( this.bActive && this.iStep < step )
		{
			this.iStep = step;
			this.UpdateStepDisplay();
		}
	},

	OnSelectedNonEmptyInventory: function() {
		this.AdvanceToStep( 2 );
	},

	OnUserAddedItemsToTrade: function() {
		this.AdvanceToStep( 3 );
	},

	OnUserIsReady: function() {
		this.AdvanceToStep( 4 );
	},

	EndTutorial: function() {
		var elHeaderMessage = $('tutorial_header_message');
		if ( elHeaderMessage && elHeaderMessage.visible() )
		{
			new Effect.BlindUp( elHeaderMessage, {duration: 0.25 } );
		}
		this.bActive = false;
		// update step display will hide all step arrows when active is false
		this.UpdateStepDisplay();
		this.OnCompletedTutorial();
	},

	OnCompletedTutorial: function() {
		SetCookie( 'bCompletedTradeTutorial', 'true', 365 * 10, '/trade/' );
	}


};

function SeenSteamGuardWarning() {
	var elHeaderMessage = $('steamguard_header_message');
	if ( elHeaderMessage && elHeaderMessage.visible() )
	{
		new Effect.BlindUp( elHeaderMessage, {duration: 0.25 } );
	}

	SetCookie( 'bSeenSteamGuardWarning', 'true', 365 * 10, '/trade/' );
}

function SizeWindow()
{

	if ( !Prototype.Browser.WebKit )
	{
		return;
	}
	
	var widthZoom = document.viewport.getWidth() / 976;
	var heightZoom = document.viewport.getHeight() / 995;
	if ( widthZoom <= 0.92 || heightZoom <= 0.92 )
	{
		var flZoom = widthZoom < heightZoom ? widthZoom : heightZoom;
		document.body.style.zoom = flZoom > 0.55 ? flZoom : 0.55;
	}
	else
	{
		document.body.style.zoom = 1.0;
	}

	$('log').scrollTop = 10000;
}

function TradingUnloaded( e )
{
	if ( g_bTradeCancelled )
		return;

	g_bTradeCancelled = true;
	var waiting = true;
	new Ajax.Request( 'http://steamcommunity.com/trade/' + g_ulTradePartnerSteamID + '/cancel/', {
		method: 'post',
		parameters: {
			sessionid: g_sessionID
		}
	});

	// "this is pretty wonky"
	var iters = 0;
	var start = new Date().getMilliseconds();
	while ( iters < 10000000 && ( new Date().getMilliseconds() - start ) < 30 ) { iters++; }
};

function StopWatchingForUnload()
{
	Event.stopObserving( window, 'unload', TradingUnloaded );
}

