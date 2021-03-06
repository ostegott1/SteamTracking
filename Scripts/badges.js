
//-----------------------------------------------------------------------------
// Badge crafting
//-----------------------------------------------------------------------------

var g_CraftModal;
var g_rgBadgeCraftData = null;
var g_bBadgeCraftAnimationReady = false;

function Profile_CraftGameBadge( profileUrl, appid, series, border_color )
{
	var submitUrl = profileUrl + "/ajaxcraftbadge/";
	g_rgBadgeCraftData = null;
	g_bBadgeCraftAnimationReady = false;

	// fire off the ajax request to craft the badge
	$J.post(submitUrl,{ appid: appid, series: series, border_color: border_color, sessionid: g_sessionID } )
		.done( function( data ) {
			g_rgBadgeCraftData = data;
			FinishCraft();
		}).fail( function() {
			g_CraftModal && g_CraftModal.Dismiss();
			ShowAlertDialog( 'Craft badge', 'crafting failed' );
		});


	// display the crafting modal and animation
	var $Crafter = $J('#badge_crafter');
	var $Throbber = $J('#badge_craft_loop_throbber');

	g_CraftModal = ShowDialog( 'Craft badge', $Crafter, { bExplicitDismissalOnly: true } );

	$Crafter.show();
	g_CraftModal.GetContent().addClass( 'badge_craft_modal' );
	g_CraftModal.GetContent().find('.newmodal_content').css( 'overflow', 'visible' );
	g_CraftModal.GetContent().css( 'overflow', 'hidden' );

	g_CraftModal.AdjustSizing();
	g_CraftModal.SetRemoveContentOnDismissal( false );

	$Throbber.addClass( 'loop_throbber_hide' );
	$Throbber.show();

	// show the right title
	$J('#badge_craft_header_crafting').show();
	$J('#badge_craft_header_crafted').hide();
	$J('#badge_completed').hide();

	// start the animation for each card, staggered
	var iCard = 0;
	$J('#card_image_set').children().each( function() {
		var $Card = $J(this);
		$Card.hide();
		$Card.removeClass( 'card_craft_combined' );

		window.setTimeout( function() {
			$Card.show();
			$Card.addClass( 'card_craft_combined' );
		}, iCard++ * 500 );
	} );

	// we start the next phase half a second before the animation would end, so we can animate the badge appearing on top.
	var nAnimationTimeMS = ( ( iCard - 1 ) * 500 ) + (4000 - 500);
	window.setTimeout( function() {
		$Throbber.removeClass( 'loop_throbber_hide' );
		g_bBadgeCraftAnimationReady = true;
		g_CraftModal.GetContent().find('.newmodal_content').css( 'overflow', '' );
		FinishCraft();
	}, nAnimationTimeMS );
}

function FinishCraft()
{
	if ( !g_rgBadgeCraftData || !g_bBadgeCraftAnimationReady )
		return;

	$J('#badge_craft_loop_throbber').hide();

	$J('#badge_craft_header_crafting').fadeOut( 'fast' );
	$J('#badge_craft_header_crafted').fadeIn( 'fast' );

	var $Badge = $J('#badge_completed');
	var $BadgeAnimation = $Badge.find( '.completed_badge_animation_ctn');

	var $BadgeRewards = $J('#badge_rewards');
	var $BadgeRewardsList = $J('#badge_rewards_ctn');
	var $BadgeRewardsActions = $BadgeRewards.find('.badge_rewards_actions');

	if ( g_rgBadgeCraftData && g_rgBadgeCraftData.Badge )
	{
		BuildBadgeDisplay( $Badge, g_rgBadgeCraftData.Badge );
	}

	var rgBadgeRewards = [];
	if ( g_rgBadgeCraftData && g_rgBadgeCraftData.rgDroppedItems )
	{
		for ( var i = 0; i < g_rgBadgeCraftData.rgDroppedItems.length; i++ )
		{
			var $Reward = BuildBadgeReward( g_rgBadgeCraftData.rgDroppedItems[i] );
			$BadgeRewardsList.append( $Reward );
			$Reward.hide();
			rgBadgeRewards.push( $Reward );
		}
	}

	$BadgeAnimation.css( 'width', '0' );
	$Badge.show();
	$BadgeAnimation.animate( { width: 414 }, function() {
		$BadgeRewards.show();
		var nMSToWait = 500;

		for ( var i = 0; i < rgBadgeRewards.length; i++ )
		{
			var $Reward = rgBadgeRewards[i];
			window.setTimeout( DisplayBadgeRewardClosure( $Reward ), nMSToWait );
			nMSToWait += 500;
		}
		window.setTimeout( function() {
			$BadgeRewardsActions.show();

			// add the close button and "click outside dismisses modal" behavior back to modal.
			//	when/if they close, we'll reload the page.
			g_CraftModal.GetContent().find('.newmodal_close').show();
			g_CraftModal.SetDismissOnBackgroundClick( true );

			g_CraftModal.always( function() { ShowDialog( 'Craft Badge', 'Reloading...' ); window.location.reload(); } );

			g_CraftModal.AdjustSizing( 'slow' );
		}, nMSToWait );

	} );
}

function BuildBadgeDisplay( $BadgeCtn, Badge )
{
	var $IconContainer = $BadgeCtn.find( '.completed_badge_icon' );
	var $Content = $BadgeCtn.find( '.completed_badge_content' );

	$IconContainer.append( $J('<img/>', {src: Badge.image } ) );

	var DateUnlocked = new Date( Badge.unlocked_time * 1000 );
	var $XPLine = $J('<div/>', {'class': 'completed_badge_xp' } ).text( 'XP ' + Badge.xp + ' ' );
	$XPLine.append( $J('<span/>', {'class': 'completed_badge_unlock' }).text( DateUnlocked.toLocaleString() ) );

	$Content.append(
		$J('<div/>', {'class': 'completed_badge_title' } ).text( Badge.title ),
		$XPLine,
		$J('<div/>', {'class': 'completed_badge_game' } ).text( Badge.game )
	);
}

function BuildBadgeReward( rgRewardData )
{
	if ( rgRewardData.type == 'levelup' )
		return BuildLevelUpReward( rgRewardData );

	var $RewardCtn = $J('<div/>', {'class': 'badge_reward_ctn'} )

	if ( rgRewardData.label )
	{
		var $RewardLabel = $J('<div/>',{'class': 'badge_reward_label'}).text( rgRewardData.label );
		$RewardCtn.append( $RewardLabel );
	}

	var $Reward = $J('<div/>', {'class': 'badge_reward'} );
	var $Icon = $J('<div/>', {'class': 'badge_reward_icon'} );
	if ( rgRewardData.image )
	{
		$Icon.append( $J('<img/>', {src: rgRewardData.image } ) );
	}
	var $Content = $J('<div/>', {'class': 'badge_reward_content' } );
	$Content.append(
		$J('<div/>', {'class': 'badge_reward_title'}).text( rgRewardData.title ),
		$J('<div/>').text( rgRewardData.description )
	);

	$Reward.append( $Icon, $Content, $J('<div/>', {style: 'clear: left;' } ) );
	$RewardCtn.append( $Reward );
	return $RewardCtn;
}

function BuildLevelUpReward( rgRewardData )
{
	var $Reward = $J('<div/>', {'class': 'badge_reward_level'} );

	var $Level = $J('<div/>', {'class': rgRewardData.level_css_class } );
	$Level.append( $J('<span/>', {'class': 'friendPlayerLevelNum' }).text( rgRewardData.level ) );

	var strDescription = 'Level %s achieved'.replace( /%s/, rgRewardData.level );

	return $Reward.append( $Level, strDescription );
}

function DisplayBadgeRewardClosure( $Reward )
{
	return function() {
		$Reward.fadeIn();
		g_CraftModal.AdjustSizing( 'slow' );
	}
}

function playSound( soundfile )
{
	$('audio_player').innerHTML=
		"<embed src=\""+soundfile+"\" hidden=\"true\" autostart=\"true\" loop=\"false\" />";
}

function Profile_LevelUp( profileUrl )
{
	var submitUrl = profileUrl + "/ajaxlevelup/";
	new Ajax.Request(submitUrl, {
		method:'post',
		parameters: { sessionid: g_sessionID },
		onSuccess: function(transport){
			var json = transport.responseJSON;
			if ( json.message )
			{
				ShowAlertDialog( 'Level up', json.message).done( function() {
					window.location.reload();
				} );
			}
			else if ( json.success == 1 )
			{
				window.location.reload();
			}
		}
	});
}

function GameCardArtDialog( strName, strImgURL )
{
	var $Img = $J('<img/>' );
	var $Link = $J('<a/>', {href: strImgURL, target: '_blank' } );
	var Modal = ShowDialog( strName, $Link.append( $Img ) );
	Modal.GetContent().hide();

	// set src after binding onload to be sure we catch it.
	$Img.load( function() { Modal.GetContent().show(); } );
	$Img.attr( 'src', strImgURL );

	Modal.OnResize( function( nMaxWidth, nMaxHeight ) {
		$Img.css( 'max-width', nMaxWidth );
		$Img.css( 'max-height', nMaxHeight );
	} );

	Modal.AdjustSizing();
}

/*
	'name' => $rgApp ? $rgApp['name'] : '',
	'drops_remaining' => $Progress->drops_remaining,
	'cards_dropped' => $Progress->cards_dropped,
	'drops_earned_pre_release' => $Progress->drops_earned_pre_release,
	'drops_earned_post_release' => $Progress->drops_earned_post_release,
	'drops_earned_purchase' => $Progress->drops_earned_purchase,
	'est_usd_cents_earned_to_next_drop' => $Progress->est_usd_cents_earned_to_next_drop,
	'est_usd_cents_needed_for_next_drop' => $Progress->est_usd_cents_needed_for_next_drop,
*/

function ShowCardDropInfo( strGameName, id )
{
	var $Content = $J('#' + id);
	$Content.detach();
	$Content.show();

	ShowAlertDialog( strGameName, $Content).always(
		function() {
			// save it away again for later
			$Content.hide();
			$J(document.body).append( $Content );
		}
	);

}

