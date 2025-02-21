import type { Data, RedditObject } from "../../helper/types";
import type { _Listing, Context, Fetcher, RedditMore } from "../listing";
import type Comment from "../../objects/comment";
import { emptyRedditListing, wrapChildren } from "./../util";
import Listing from "../listing";
import CommentListing from "./commentListing";

function fixCommentTree(objects: RedditObject[]) {
  // Map the items by their name.
  const map: Record<string, RedditObject> = {};
  for (const item of objects) {
    if (!item.data.name) throw "Hmm...";
    map[item.data.name] = item;

    // Ensure that all the comments have a replies listing.
    if (item.kind === "t1") {
      if (item.data.replies !== "") throw "?????";
      item.data.replies = { kind: "Listing", data: wrapChildren([]) };
    }
  }

  // Build up the tree.
  const tree: RedditObject[] = [];
  for (const item of objects) {
    const parent = map[item.data.parent_id];
    if (parent) {
      parent.data.replies.data.children.push(item);
    } else if (item.kind === "t1") {
      tree.push(item);
    }
  }

  return tree;
}

/** @internal */
export default class MoreComments implements Fetcher<Comment> {
  protected data: RedditMore;

  constructor(data: RedditMore) {
    this.data = data;
  }

  async fetch(ctx: Context): Promise<Listing<Comment>> {
    if (this.data.name === "t1__") {
      const id = this.data.parent_id.slice(3);
      const pth = `comments/${ctx.post}`;
      const res: Data = await ctx.client.get(pth, { comment: id });
      const obj: RedditObject = res[1].data.children[0];
      if (!obj) {
        return new CommentListing(emptyRedditListing, ctx);
      } else {
        const lst = obj.data.replies.data ?? emptyRedditListing;
        return new CommentListing(lst, ctx);
      }
    } else {
      // api/morechildren can't handle more than ~75 items at a time, so we have
      // to batch it. Yes the docs *say* 100, but if we do that we start loosing
      // items.
      const page = this.data.children.slice(0, 75);
      const rest = this.data.children.slice(75);

      const query = { children: page.join(","), link_id: `t3_${ctx.post}` };
      const res: Data = await ctx.client.get("api/morechildren", query);

      const children = fixCommentTree(res.things);

      // If there are more children, put another More at the end of the list.
      if (rest.length > 0) {
        const more: RedditObject<RedditMore> = {
          kind: "more",
          data: {
            // I have no clue if this count calculation is correct, but it's not
            // currently being used anyway, so... ¯\_(ツ)_/¯
            count: this.data.count - res.things.length,
            depth: this.data.depth,
            children: rest,
            id: rest[0],
            name: `t1_${rest[0]}`,
            parent_id: this.data.parent_id,
          },
        };

        children.push(more);
      }

      return new CommentListing(wrapChildren(children), ctx);
    }
  }
}
